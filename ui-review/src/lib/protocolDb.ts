import Dexie, { type Table } from "dexie";

export type RawProtocol = {
    id: string;
    name: string;
    region: string;
    patientType: "adult" | "child";
    scanLocationLabel: string;
    supportedPositions: string[];
    supportedModes: string[];
};

export type RawRecon = {
    id: string;
    name: string;
    params: Record<string, string | number | boolean>;
};

export type RawSequence = {
    id: string;
    name: string;
    sequenceType: string;
    mode: string;
    scanParams: Record<string, string | number | boolean>;
    reconstructionParams: RawRecon[];
};

export type RawProtocolCase = {
    protocol: RawProtocol;
    sequences: RawSequence[];
};

type ProtocolRow = {
    id?: number;
    protocolId: string;
    name: string;
    region: string;
    patientType: "adult" | "child";
    scanLocationLabel: string;
    supportedPositionsJson: string;
    supportedModesJson: string;
};

type SequenceRow = {
    id?: number;
    protocolId: string;
    sequenceId: string;
    name: string;
    sequenceType: string;
    mode: string;
    scanParamsJson: string;
};

type ReconstructionRow = {
    id?: number;
    protocolId: string;
    sequenceId: string;
    reconId: string;
    name: string;
    paramsJson: string;
};

type MetadataRow = {
    key: string;
    value: string;
};

type BusinessTable<T> = {
    rows: T[];
};

type BusinessProtocolRow = {
    id: string;
    name: string;
    region: string;
    ageGroup?: string | null;
    scanLocationLabel: string;
    supportedPositions: string;
    supportedModes: string;
};

type BusinessSequenceRow = {
    id: string;
    protocolId: string;
    queueId: string;
    name: string;
    sequenceType: string;
    mode: string;
    params: string;
    sortOrder: number;
};

type BusinessReconRow = {
    id: string;
    protocolId: string;
    protocolQueueId: string;
    taskId: string;
    name: string;
    params: string;
    sortOrder: number;
};

export type BusinessProtocolSnapshot = {
    meta?: {
        generated_at?: string;
    };
    tables: {
        protocol: BusinessTable<BusinessProtocolRow>;
        protocol_queue: BusinessTable<BusinessSequenceRow>;
        protocol_recon_task: BusinessTable<BusinessReconRow>;
    };
};

const SNAPSHOT_IMPORT_KEY = "protocol_snapshot_import_marker";
const SNAPSHOT_IMPORT_VERSION = "v2";

class ProtocolDb extends Dexie {
    protocols!: Table<ProtocolRow, number>;
    sequences!: Table<SequenceRow, number>;
    reconstructions!: Table<ReconstructionRow, number>;
    metadata!: Table<MetadataRow, string>;

    constructor() {
        super("ct_protocol_db");
        this.version(1).stores({
            protocols: "++id,&protocolId,name,region",
            sequences: "++id,[protocolId+sequenceId],protocolId,sequenceId,mode",
            reconstructions: "++id,[protocolId+sequenceId+reconId],protocolId,sequenceId,reconId",
        });
        this.version(2).stores({
            protocols: "++id,&protocolId,name,region",
            sequences: "++id,[protocolId+sequenceId],protocolId,sequenceId,mode",
            reconstructions: "++id,[protocolId+sequenceId+reconId],protocolId,sequenceId,reconId",
            metadata: "&key",
        });
    }
}

export const protocolDb = new ProtocolDb();

const parseJsonValue = <T>(value: string, fallback: T): T => {
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};

const toStringArray = (value: string): string[] => {
    const parsed = parseJsonValue<unknown>(value, []);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
};

const toParamRecord = (value: string): Record<string, string | number | boolean> => {
    const parsed = parseJsonValue<unknown>(value, {});
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
        Object.entries(parsed).filter(
            (entry): entry is [string, string | number | boolean] =>
                typeof entry[1] === "string" || typeof entry[1] === "number" || typeof entry[1] === "boolean"
        )
    );
};

const toSnapshotMarker = (snapshot: BusinessProtocolSnapshot): string => {
    const generatedAt = snapshot.meta?.generated_at ?? "unknown";
    const protocolCount = snapshot.tables.protocol.rows.length;
    const sequenceCount = snapshot.tables.protocol_queue.rows.length;
    const reconCount = snapshot.tables.protocol_recon_task.rows.length;
    return `${SNAPSHOT_IMPORT_VERSION}:${generatedAt}:${protocolCount}:${sequenceCount}:${reconCount}`;
};

export const mapAgeGroupToPatientType = (ageGroup?: string | null): "adult" | "child" => {
    if (ageGroup === "儿童" || ageGroup === "婴儿") {
        return "child";
    }
    return "adult";
};

export const convertBusinessSnapshotToProtocolCases = (snapshot: BusinessProtocolSnapshot): RawProtocolCase[] => {
    const protocols = [...snapshot.tables.protocol.rows].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
    const sequences = snapshot.tables.protocol_queue.rows;
    const reconstructions = snapshot.tables.protocol_recon_task.rows;

    return protocols.map((protocolRow) => {
        const protocolSequences = sequences
            .filter((row) => row.protocolId === protocolRow.id)
            .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-CN"))
            .map<RawSequence>((sequenceRow) => ({
                id: sequenceRow.queueId || sequenceRow.id,
                name: sequenceRow.name,
                sequenceType: sequenceRow.sequenceType,
                mode: sequenceRow.mode,
                scanParams: toParamRecord(sequenceRow.params),
                reconstructionParams: reconstructions
                    .filter((row) => row.protocolQueueId === sequenceRow.id)
                    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-CN"))
                    .map((reconRow) => ({
                        id: reconRow.taskId || reconRow.id,
                        name: reconRow.name,
                        params: toParamRecord(reconRow.params),
                    })),
            }));

        return {
            protocol: {
                id: protocolRow.id,
                name: protocolRow.name,
                region: protocolRow.region,
                patientType: mapAgeGroupToPatientType(protocolRow.ageGroup),
                scanLocationLabel: protocolRow.scanLocationLabel,
                supportedPositions: toStringArray(protocolRow.supportedPositions),
                supportedModes: toStringArray(protocolRow.supportedModes),
            },
            sequences: protocolSequences,
        };
    });
};

const saveProtocolCases = async (cases: RawProtocolCase[]): Promise<void> => {
    await protocolDb.transaction("rw", protocolDb.protocols, protocolDb.sequences, protocolDb.reconstructions, async () => {
        await protocolDb.protocols.clear();
        await protocolDb.sequences.clear();
        await protocolDb.reconstructions.clear();

        const protocolRows: ProtocolRow[] = cases.map(({ protocol }) => ({
            protocolId: protocol.id,
            name: protocol.name,
            region: protocol.region,
            patientType: protocol.patientType,
            scanLocationLabel: protocol.scanLocationLabel,
            supportedPositionsJson: JSON.stringify(protocol.supportedPositions),
            supportedModesJson: JSON.stringify(protocol.supportedModes),
        }));
        await protocolDb.protocols.bulkAdd(protocolRows);

        const sequenceRows: SequenceRow[] = [];
        const reconRows: ReconstructionRow[] = [];

        for (const protocolCase of cases) {
            for (const sequence of protocolCase.sequences) {
                sequenceRows.push({
                    protocolId: protocolCase.protocol.id,
                    sequenceId: sequence.id,
                    name: sequence.name,
                    sequenceType: sequence.sequenceType,
                    mode: sequence.mode,
                    scanParamsJson: JSON.stringify(sequence.scanParams),
                });

                for (const recon of sequence.reconstructionParams) {
                    reconRows.push({
                        protocolId: protocolCase.protocol.id,
                        sequenceId: sequence.id,
                        reconId: recon.id,
                        name: recon.name,
                        paramsJson: JSON.stringify(recon.params),
                    });
                }
            }
        }

        if (sequenceRows.length > 0) {
            await protocolDb.sequences.bulkAdd(sequenceRows);
        }
        if (reconRows.length > 0) {
            await protocolDb.reconstructions.bulkAdd(reconRows);
        }
    });
};

export const seedProtocolCasesIfEmpty = async (cases: RawProtocolCase[]): Promise<void> => {
    const count = await protocolDb.protocols.count();
    if (count > 0) return;
    await saveProtocolCases(cases);
};

export const ensureBusinessSnapshotImported = async (snapshot: BusinessProtocolSnapshot): Promise<void> => {
    const snapshotMarker = toSnapshotMarker(snapshot);
    const importedMarker = await protocolDb.metadata.get(SNAPSHOT_IMPORT_KEY);

    if (importedMarker?.value === snapshotMarker) {
        return;
    }

    const protocolCases = convertBusinessSnapshotToProtocolCases(snapshot);

    await protocolDb.transaction(
        "rw",
        protocolDb.protocols,
        protocolDb.sequences,
        protocolDb.reconstructions,
        protocolDb.metadata,
        async () => {
            await protocolDb.protocols.clear();
            await protocolDb.sequences.clear();
            await protocolDb.reconstructions.clear();

            const protocolRows: ProtocolRow[] = protocolCases.map(({ protocol }) => ({
                protocolId: protocol.id,
                name: protocol.name,
                region: protocol.region,
                patientType: protocol.patientType,
                scanLocationLabel: protocol.scanLocationLabel,
                supportedPositionsJson: JSON.stringify(protocol.supportedPositions),
                supportedModesJson: JSON.stringify(protocol.supportedModes),
            }));

            if (protocolRows.length > 0) {
                await protocolDb.protocols.bulkAdd(protocolRows);
            }

            const sequenceRows: SequenceRow[] = [];
            const reconRows: ReconstructionRow[] = [];

            for (const protocolCase of protocolCases) {
                for (const sequence of protocolCase.sequences) {
                    sequenceRows.push({
                        protocolId: protocolCase.protocol.id,
                        sequenceId: sequence.id,
                        name: sequence.name,
                        sequenceType: sequence.sequenceType,
                        mode: sequence.mode,
                        scanParamsJson: JSON.stringify(sequence.scanParams),
                    });

                    for (const recon of sequence.reconstructionParams) {
                        reconRows.push({
                            protocolId: protocolCase.protocol.id,
                            sequenceId: sequence.id,
                            reconId: recon.id,
                            name: recon.name,
                            paramsJson: JSON.stringify(recon.params),
                        });
                    }
                }
            }

            if (sequenceRows.length > 0) {
                await protocolDb.sequences.bulkAdd(sequenceRows);
            }
            if (reconRows.length > 0) {
                await protocolDb.reconstructions.bulkAdd(reconRows);
            }

            await protocolDb.metadata.put({
                key: SNAPSHOT_IMPORT_KEY,
                value: snapshotMarker,
            });
        }
    );
};

export const loadProtocolCasesFromDb = async (): Promise<RawProtocolCase[]> => {
    const [protocolRows, sequenceRows, reconRows] = await Promise.all([
        protocolDb.protocols.toArray(),
        protocolDb.sequences.toArray(),
        protocolDb.reconstructions.toArray(),
    ]);

    return protocolRows.map((protocolRow) => {
        const protocolSequences = sequenceRows.filter((row) => row.protocolId === protocolRow.protocolId);

        const sequences: RawSequence[] = protocolSequences.map((sequenceRow) => {
            const reconstructions = reconRows
                .filter((row) => row.protocolId === sequenceRow.protocolId && row.sequenceId === sequenceRow.sequenceId)
                .map((row) => ({
                    id: row.reconId,
                    name: row.name,
                    params: JSON.parse(row.paramsJson) as Record<string, string | number | boolean>,
                }));

            return {
                id: sequenceRow.sequenceId,
                name: sequenceRow.name,
                sequenceType: sequenceRow.sequenceType,
                mode: sequenceRow.mode,
                scanParams: JSON.parse(sequenceRow.scanParamsJson) as Record<string, string | number | boolean>,
                reconstructionParams: reconstructions,
            };
        });

        return {
            protocol: {
                id: protocolRow.protocolId,
                name: protocolRow.name,
                region: protocolRow.region,
                patientType: protocolRow.patientType || "adult",
                scanLocationLabel: protocolRow.scanLocationLabel,
                supportedPositions: JSON.parse(protocolRow.supportedPositionsJson) as string[],
                supportedModes: JSON.parse(protocolRow.supportedModesJson) as string[],
            },
            sequences,
        };
    });
};

export const createProtocolCase = async (protocolCase: RawProtocolCase): Promise<void> => {
    await protocolDb.transaction("rw", protocolDb.protocols, protocolDb.sequences, protocolDb.reconstructions, async () => {
        await protocolDb.protocols.add({
            protocolId: protocolCase.protocol.id,
            name: protocolCase.protocol.name,
            region: protocolCase.protocol.region,
            patientType: protocolCase.protocol.patientType,
            scanLocationLabel: protocolCase.protocol.scanLocationLabel,
            supportedPositionsJson: JSON.stringify(protocolCase.protocol.supportedPositions),
            supportedModesJson: JSON.stringify(protocolCase.protocol.supportedModes),
        });

        if (protocolCase.sequences.length > 0) {
            await protocolDb.sequences.bulkAdd(
                protocolCase.sequences.map((sequence) => ({
                    protocolId: protocolCase.protocol.id,
                    sequenceId: sequence.id,
                    name: sequence.name,
                    sequenceType: sequence.sequenceType,
                    mode: sequence.mode,
                    scanParamsJson: JSON.stringify(sequence.scanParams),
                }))
            );

            const reconRows: ReconstructionRow[] = [];
            for (const sequence of protocolCase.sequences) {
                for (const recon of sequence.reconstructionParams) {
                    reconRows.push({
                        protocolId: protocolCase.protocol.id,
                        sequenceId: sequence.id,
                        reconId: recon.id,
                        name: recon.name,
                        paramsJson: JSON.stringify(recon.params),
                    });
                }
            }
            if (reconRows.length > 0) {
                await protocolDb.reconstructions.bulkAdd(reconRows);
            }
        }
    });
};

export const updateProtocolMeta = async (
    protocolId: string,
    patch: Partial<Pick<RawProtocol, "name" | "region" | "patientType" | "scanLocationLabel" | "supportedPositions" | "supportedModes">>
): Promise<void> => {
    const row = await protocolDb.protocols.where("protocolId").equals(protocolId).first();
    if (!row || row.id === undefined) return;

    await protocolDb.protocols.update(row.id, {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.region !== undefined ? { region: patch.region } : {}),
        ...(patch.patientType !== undefined ? { patientType: patch.patientType } : {}),
        ...(patch.scanLocationLabel !== undefined ? { scanLocationLabel: patch.scanLocationLabel } : {}),
        ...(patch.supportedPositions !== undefined ? { supportedPositionsJson: JSON.stringify(patch.supportedPositions) } : {}),
        ...(patch.supportedModes !== undefined ? { supportedModesJson: JSON.stringify(patch.supportedModes) } : {}),
    });
};

export const deleteProtocolCase = async (protocolId: string): Promise<void> => {
    await protocolDb.transaction("rw", protocolDb.protocols, protocolDb.sequences, protocolDb.reconstructions, async () => {
        await protocolDb.protocols.where("protocolId").equals(protocolId).delete();
        await protocolDb.sequences.where("protocolId").equals(protocolId).delete();
        await protocolDb.reconstructions.where("protocolId").equals(protocolId).delete();
    });
};
