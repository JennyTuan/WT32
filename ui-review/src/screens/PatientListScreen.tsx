import { useCallback, useEffect, useState } from 'react';
import {
    Plus,
    Trash2,
    ChevronDown,
    ChevronUp,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Search,
    Upload,
    Download,
    Eye,
    Image as ImageIcon,
    ChevronsLeft,
    ChevronsRight
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import AddPatientScreen from './AddPatientScreen';
import AppHeader from '../components/AppHeader';
import { FeedbackNotice } from '../components/FeedbackNotice';
import { saveSelectedPatient } from '../lib/patientSession';
import {
    listPatients,
    calcAgeFromBirthDate,
    mapGenderToZh,
    mapStatusToZh,
    type ApiPatient,
} from '../lib/patientsApi';
import { saveSelectedScanSessionId } from '../lib/scanSession';
import { resolveCompletedExamViewerState } from '../lib/completedExamViewerState';
import { clearSelectedExamWorkflowState } from '../lib/workflowNavigationState';
import { useI18n } from '../lib/i18nContext';
import type { TranslationKey } from '../lib/i18n';

type CheckStatus = '待进行' | '已完成' | '已终止';
type SortKey = 'serial' | 'patientId' | 'name' | 'gender' | 'age' | 'projectName' | 'examTime' | 'checkStatus';

type PatientRecord = {
    id: number;
    serial: number;
    patientId: string;
    name: string;
    gender: string;
    age: number;
    checkStatus: CheckStatus;
    latestSessionId: number | null;
    latestAcquisitionType: ApiPatient["latest_scan_acquisition_type"];
    latestScanMode: ApiPatient["latest_scan_mode"];
    projectName: string | null;
    examTime: string | null;
};

const mapApiPatientToRecord = (p: ApiPatient, index: number, locale: string): PatientRecord => ({
    id: p.id,
    serial: index + 1,
    patientId: p.patient_id,
    name: p.name,
    gender: mapGenderToZh(p.gender),
    age: typeof p.age === "number" ? p.age : (p.birth_date ? calcAgeFromBirthDate(p.birth_date) : 0),
    checkStatus: mapStatusToZh(p.latest_scan_status),
    latestSessionId: p.latest_scan_session_id,
    latestAcquisitionType: p.latest_scan_acquisition_type,
    latestScanMode: p.latest_scan_mode,
    projectName: p.latest_scan_name,
    examTime: p.latest_scan_completed_at
        ? new Date(p.latest_scan_completed_at).toLocaleString(locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        : null,
});

const PatientListScreen = () => {
    const { locale, t } = useI18n();
    const location = useLocation();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'completed'
    const [patients, setPatients] = useState<PatientRecord[]>([]);
    const [selectedRows, setSelectedRows] = useState<number[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [isNameMasked, setIsNameMasked] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>('serial');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const openCompletedExam = useCallback(async (patient: PatientRecord) => {
        saveSelectedPatient({
            id: patient.id,
            serial: patient.serial,
            patientId: patient.patientId,
            name: patient.name,
            gender: patient.gender,
            age: patient.age,
        });
        clearSelectedExamWorkflowState();
        if (patient.latestSessionId) {
            saveSelectedScanSessionId(patient.latestSessionId);
        }

        const viewerState = await resolveCompletedExamViewerState({
            patientId: patient.id,
            scanSessionId: patient.latestSessionId,
            acquisitionType: patient.latestAcquisitionType,
            scanMode: patient.latestScanMode,
        });
        navigate('/image-viewer', { state: viewerState });
    }, [navigate]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const refreshPatients = useCallback(async () => {
        try {
            const apiList = await listPatients();
            setPatients(apiList.map((patient, index) => mapApiPatientToRecord(patient, index, locale)));
            setLoadError(null);
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : t("patientList.errorLoad"));
        }
    }, [locale, t]);

    useEffect(() => {
        // Route-key refresh intentionally reloads server data into local table state.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void refreshPatients();
    }, [location.key, refreshPatients]);

    const checkStatusClass: Record<CheckStatus, string> = {
        待进行: 'bg-[#FFF3E0] text-[#FA8C16] border border-[#FFD591]',
        已完成: 'bg-[#E8F5E9] text-[#43A047] border border-[#A5D6A7]',
        已终止: 'bg-[#FFEBEE] text-[#D32F2F] border border-[#FFCDD2]',
    };

    const toggleSelectRow = (id: number) => {
        setSelectedRows((current) =>
            current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
        );
    };

    const isTerminalStatus = (status: CheckStatus) => status === '已完成' || status === '已终止';

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filteredPatients = patients.filter((patient) => {
        const matchesTab = activeTab === 'completed'
            ? patient.checkStatus === '已完成'
            : patient.checkStatus !== '已完成';
        const matchesQuery = normalizedQuery.length === 0
            || patient.name.toLowerCase().includes(normalizedQuery)
            || patient.patientId.toLowerCase().includes(normalizedQuery)
            || (activeTab === 'completed' && (patient.projectName ?? '').toLowerCase().includes(normalizedQuery));

        return matchesTab && matchesQuery;
    });

    const sortedPatients = [...filteredPatients].sort((a, b) => {
        const aVal = a[sortKey] ?? '';
        const bVal = b[sortKey] ?? '';
        let cmp: number;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            cmp = aVal - bVal;
        } else {
            cmp = String(aVal).localeCompare(String(bVal), locale);
        }
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const selectedPatient = selectedRows.length === 1
        ? patients.find((patient) => patient.id === selectedRows[0]) ?? null
        : null;
    const selectedPatients = patients.filter((patient) => selectedRows.includes(patient.id));
    const canProceed = selectedRows.length === 1;
    const canDeleteSelected = activeTab !== 'completed'
        && selectedPatients.length > 0
        && selectedPatients.every((patient) => !isTerminalStatus(patient.checkStatus));
    const canExportSelected = selectedPatients.length > 0;
    const backRoute = typeof location.state === 'object' && location.state && 'backRoute' in location.state
        ? location.state.backRoute
        : null;

    const maskName = (name: string) => {
        if (!isNameMasked) return name;
        if (name.length <= 1) return '*';
        if (name.length === 2) return `${name[0]}*`;
        return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}`;
    };

    const toggleSelectAll = () => {
        const visibleIds = filteredPatients.map((patient) => patient.id);
        const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedRows.includes(id));

        if (allVisibleSelected) {
            setSelectedRows((current) => current.filter((id) => !visibleIds.includes(id)));
        } else {
            setSelectedRows((current) => Array.from(new Set([...current, ...visibleIds])));
        }
    };

    const handleDeleteSelected = () => {
        if (!canDeleteSelected) return;

        setPatients((current) => current.filter((patient) => !selectedRows.includes(patient.id)));
        setSelectedRows([]);
    };

    const allVisibleSelected = filteredPatients.length > 0
        && filteredPatients.every((patient) => selectedRows.includes(patient.id));

    const visibleSelectedCount = filteredPatients.filter((patient) => selectedRows.includes(patient.id)).length;
    const formatGender = (gender: string) => {
        if (gender === "男") return t("patientList.gender.male");
        if (gender === "女") return t("patientList.gender.female");
        if (gender === "其他") return t("patientList.gender.other");
        return gender;
    };
    const formatCheckStatus = (status: CheckStatus) => {
        if (status === "已完成") return t("patientList.status.completed");
        if (status === "已终止") return t("patientList.status.cancelled");
        return t("patientList.status.pending");
    };
    const tableLabels: Record<SortKey, TranslationKey> = {
        serial: "patientList.table.serial",
        patientId: "patientList.table.patientId",
        name: "patientList.table.name",
        gender: "patientList.table.gender",
        age: "patientList.table.age",
        projectName: "patientList.table.projectName",
        examTime: "patientList.table.examTime",
        checkStatus: activeTab === "completed" ? "patientList.imageStatus" : "patientList.examStatus",
    };

    useEffect(() => {
        if (selectedRows.length > 0 && selectedPatients.length === 0) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelectedRows([]);
        }
    }, [selectedPatients.length, selectedRows.length]);

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative">

            {/* 主容器 1024x768 */}

                {/* 1. Header */}
                <AppHeader
                    patientName={selectedPatient ? maskName(selectedPatient.name) : null}
                    patientId={selectedPatient?.patientId ?? null}
                />

                {/* 2. Main Content Area */}
                <main className="flex-1 overflow-hidden p-2">

                    {/* 这里是包裹操作栏和列表内容的统一大卡片 */}
                    <div className="h-full flex flex-col bg-white rounded-lg border border-[#B0C4DE] shadow-sm overflow-hidden">

                        {/* 卡片头部：操作栏 (Toolbar Inside Card) */}
                        <div className="h-[64px] bg-[#F8FAFC] border-b border-[#EEF2F9] px-4 flex items-center justify-between shrink-0">
                            <div className="flex items-center h-full gap-4">
                                {/* 状态切换 Tabs */}
                                <div className="flex bg-[#EEF2F9] rounded-md border border-[#B0C4DE]/50 overflow-hidden p-1">
                                    <button
                                        onClick={() => { setActiveTab('pending'); setSearchQuery(''); setSortKey('serial'); setSortDir('asc'); }}
                                        className={`px-8 h-[32px] text-[13px] font-bold transition-all rounded-md ${activeTab === 'pending' ? 'bg-[#4D94FF] text-white shadow-sm' : 'text-[#4D94FF] hover:bg-white/50'}`}
                                    >
                                        {t("patientList.tabPending")}
                                    </button>
                                    <button
                                        onClick={() => { setActiveTab('completed'); setSearchQuery(''); setSortKey('examTime'); setSortDir('desc'); }}
                                        className={`px-8 h-[32px] text-[13px] font-bold transition-all rounded-md ${activeTab === 'completed' ? 'bg-[#4D94FF] text-white shadow-sm' : 'text-[#4D94FF] hover:bg-white/50'}`}
                                    >
                                        {t("patientList.tabCompleted")}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                {/* 快速操作图标 - 已移动至此处 */}
                                <div className="flex items-center gap-4 text-[#90A4AE]">
                                    <button
                                        type="button"
                                        title={t("patientList.refresh")}
                                        onClick={() => void refreshPatients()}
                                        className="text-[#90A4AE] hover:text-blue-500 transition-colors"
                                    >
                                        <RefreshCw size={18} />
                                    </button>
                                    <button
                                        type="button"
                                        title={isNameMasked ? t("patientList.closeMask") : t("patientList.openMask")}
                                        onClick={() => setIsNameMasked((current) => !current)}
                                        className={`transition-colors ${isNameMasked ? 'text-[#4D94FF]' : 'text-[#90A4AE] hover:text-blue-500'}`}
                                    >
                                        <Eye size={18} />
                                    </button>
                                    <button
                                        type="button"
                                        title={t("patientList.import")}
                                        className="text-[#90A4AE] hover:text-blue-500 transition-colors"
                                    >
                                        <Download size={18} />
                                    </button>
                                </div>

                                {/* 搜索框 */}
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder={activeTab === 'completed' ? t("patientList.searchCompleted") : t("patientList.searchPending")}
                                        className="w-[240px] h-[36px] pl-10 pr-4 bg-white border border-[#B0C4DE] rounded-md text-[13px] focus:outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/20"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#90A4AE]" size={16} />
                                </div>

                                {/* 功能按钮 */}
                                <div className="flex gap-2">
                                    <button
                                        title={t("patientList.add")}
                                        onClick={() => setShowAddModal(true)}
                                        className="w-[36px] h-[36px] bg-[#4D94FF] text-white rounded-md flex items-center justify-center shadow-sm hover:bg-blue-600 active:scale-95 transition-all"
                                    >
                                        <Plus size={18} />
                                    </button>
                                    <button
                                        title={canExportSelected ? t("patientList.export") : t("patientList.exportDisabled")}
                                        disabled={!canExportSelected}
                                        className={`w-[36px] h-[36px] rounded-md flex items-center justify-center transition-all ${canExportSelected
                                            ? 'bg-white border border-[#B0C4DE] text-[#546E7A] hover:bg-gray-50 active:scale-95'
                                            : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#B0BEC5] cursor-not-allowed'
                                            }`}
                                    >
                                        <Upload size={18} />
                                    </button>
                                    <button
                                        title={canDeleteSelected ? t("patientList.delete") : t("patientList.deleteDisabled")}
                                        disabled={!canDeleteSelected}
                                        onClick={handleDeleteSelected}
                                        className={`w-[36px] h-[36px] rounded-md flex items-center justify-center transition-all ${canDeleteSelected
                                            ? 'bg-[#FFEBEE] border border-[#FFCDD2] text-[#D32F2F] hover:bg-[#FFE3E6] hover:border-[#EF9A9A] active:scale-95'
                                            : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#B0BEC5] cursor-not-allowed'
                                            }`}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 卡片主体：列表表格 (Table Area) */}
                        <div className="flex-1 overflow-hidden flex flex-col relative">
                            <div className="flex-1 overflow-y-auto">
                                <table className="w-full border-collapse">
                                    <thead className="bg-[#4D94FF] text-white sticky top-0 z-20 h-[48px] text-[12px] font-bold uppercase tracking-wider">
                                        <tr>
                                            <th className="w-[60px] text-center border-r border-white/10">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded-sm accent-[#4D94FF]"
                                                    checked={allVisibleSelected}
                                                    onChange={toggleSelectAll}
                                                />
                                            </th>
                                            {(['serial','patientId','name','gender','age'] as SortKey[]).map((key, i) => {
                                                const active = sortKey === key;
                                                const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronDown;
                                                return (
                                                    <th key={key} onClick={() => handleSort(key)} className={`px-4 text-left border-r border-white/10 cursor-pointer select-none hover:bg-white/10 ${i === 0 ? 'w-[80px]' : ''}`}>
                                                        <span className="inline-flex items-center gap-1">
                                                            {t(tableLabels[key])}
                                                            <Icon size={14} className={active ? 'opacity-100' : 'opacity-30'} />
                                                        </span>
                                                    </th>
                                                );
                                            })}
                                            {activeTab === 'completed' && (() => {
                                                const active = sortKey === 'projectName';
                                                const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronDown;
                                                return (
                                                    <th onClick={() => handleSort('projectName')} className="px-4 text-left border-r border-white/10 cursor-pointer select-none hover:bg-white/10">
                                                        <span className="inline-flex items-center gap-1">
                                                            {t(tableLabels.projectName)}
                                                            <Icon size={14} className={active ? 'opacity-100' : 'opacity-30'} />
                                                        </span>
                                                    </th>
                                                );
                                            })()}
                                            {activeTab === 'completed' && (() => {
                                                const active = sortKey === 'examTime';
                                                const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronDown;
                                                return (
                                                    <th onClick={() => handleSort('examTime')} className="px-4 text-left border-r border-white/10 cursor-pointer select-none hover:bg-white/10">
                                                        <span className="inline-flex items-center gap-1">
                                                            {t(tableLabels.examTime)}
                                                            <Icon size={14} className={active ? 'opacity-100' : 'opacity-30'} />
                                                        </span>
                                                    </th>
                                                );
                                            })()}
                                            {(() => {
                                                const active = sortKey === 'checkStatus';
                                                const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronDown;
                                                return (
                                                    <th onClick={() => handleSort('checkStatus')} className="px-4 text-center cursor-pointer select-none hover:bg-white/10">
                                                        <span className="inline-flex items-center justify-center gap-1">
                                                            {t(tableLabels.checkStatus)}
                                                            <Icon size={14} className={active ? 'opacity-100' : 'opacity-30'} />
                                                        </span>
                                                    </th>
                                                );
                                            })()}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {sortedPatients.map((patient) => (
                                            <tr
                                                key={patient.id}
                                                onClick={() => toggleSelectRow(patient.id)}
                                                className={`h-[52px] transition-colors cursor-pointer text-[13px] ${selectedRows.includes(patient.id) ? 'bg-[#E3F2FD]' : 'hover:bg-[#F9FBFC]'}`}
                                            >
                                                <td className="text-center">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 rounded-sm accent-[#4D94FF]"
                                                        checked={selectedRows.includes(patient.id)}
                                                        onChange={() => toggleSelectRow(patient.id)}
                                                        onClick={(event) => event.stopPropagation()}
                                                    />
                                                </td>
                                                <td className="px-4 font-mono text-[#546E7A]">{patient.serial}</td>
                                                <td className="px-4 text-[#546E7A]">{patient.patientId}</td>
                                                <td className="px-4 font-bold text-[#37474F]">{maskName(patient.name)}</td>
                                                <td className="px-4">{formatGender(patient.gender)}</td>
                                                <td className="px-4">{patient.age}</td>
                                                {activeTab === 'completed' && <td className="px-4 text-[#37474F]">{patient.projectName ?? '—'}</td>}
                                                {activeTab === 'completed' && <td className="px-4 text-[#546E7A] text-[12px]">{patient.examTime ?? '—'}</td>}
                                                <td className="text-center">
                                                    {activeTab === 'completed' && patient.checkStatus === '已完成' ? (
                                                        <button
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                void openCompletedExam(patient);
                                                            }}
                                                            className="inline-flex h-[24px] px-2 rounded-full items-center justify-center gap-1 text-[11px] font-bold bg-[#E3F2FD] text-[#1E88E5] border border-[#BBDEFB]"
                                                        >
                                                            <ImageIcon size={12} />
                                                        </button>
                                                    ) : (
                                                        <span className={`inline-flex min-w-[62px] h-[24px] px-2 rounded-full items-center justify-center text-[11px] font-bold ${checkStatusClass[patient.checkStatus]}`}>
                                                            {formatCheckStatus(patient.checkStatus)}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* 卡片底部：分页 (Pagination Inside Card) */}
                            <div className="h-[50px] bg-[#F8FAFC] border-t border-[#EEF2F9] flex items-center justify-end px-6 gap-6 shrink-0">
                                <div className="flex items-center gap-2 text-[12px] text-[#546E7A]">
                                    <span className="opacity-70">{t("patientList.perPage")}</span>
                                    <div className="flex items-center gap-2 px-2 py-1 border border-[#B0C4DE] rounded bg-white cursor-pointer hover:border-blue-400">
                                        <span className="font-bold">10</span>
                                        <ChevronDown size={14} className="text-[#90A4AE]" />
                                    </div>
                                </div>

                                <div className="text-[12px] text-[#546E7A]">
                                    {t("patientList.selectedSummary", { selected: visibleSelectedCount, total: filteredPatients.length })}
                                </div>

                                <div className="flex items-center gap-1 border-l border-gray-200 pl-4 ml-2">
                                    <button className="p-1.5 text-gray-300 cursor-not-allowed"><ChevronsLeft size={16} /></button>
                                    <button className="p-1.5 text-gray-300 cursor-not-allowed"><ChevronLeft size={16} /></button>
                                    <button className="p-1.5 text-[#546E7A] hover:bg-blue-50 hover:text-blue-500 rounded transition-all"><ChevronRight size={16} /></button>
                                    <button className="p-1.5 text-[#546E7A] hover:bg-blue-50 hover:text-blue-500 rounded transition-all"><ChevronsRight size={16} /></button>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                {/* 3. Global Footer (底部操作) */}
                <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center shrink-0 px-8">
                    <div className="flex-1">
                        <button
                            onClick={() => {
                                if (typeof backRoute === 'string' && backRoute.length > 0) {
                                    navigate(backRoute, { replace: true });
                                    return;
                                }

                                navigate(-1);
                            }}
                            className="flex items-center gap-2 px-12 h-[56px] bg-white text-[#4D94FF] font-bold rounded-md border-2 border-[#4D94FF] hover:bg-blue-50 transition-all uppercase text-[14px] shadow-sm active:scale-95"
                        >
                            <ChevronLeft size={22} /> {t("common.previousStep")}
                        </button>
                    </div>
                    <div className="flex-1 flex justify-end">
                        <button
                            onClick={() => {
                                if (canProceed && selectedPatient) {
                                    if (activeTab === 'completed') {
                                        void openCompletedExam(selectedPatient);
                                    } else {
                                        saveSelectedPatient({
                                            id: selectedPatient.id,
                                            serial: selectedPatient.serial,
                                            patientId: selectedPatient.patientId,
                                            name: selectedPatient.name,
                                            gender: selectedPatient.gender,
                                            age: selectedPatient.age,
                                        });
                                        clearSelectedExamWorkflowState();
                                        navigate('/protocol-select');
                                    }
                                }
                            }}
                            disabled={!canProceed}
                            className={`flex items-center gap-2 px-12 h-[56px] font-bold rounded-md uppercase text-[14px] transition-all ${canProceed
                                ? 'bg-[#4D94FF] text-white shadow-lg hover:bg-blue-600 active:scale-95'
                                : 'bg-[#CBD5E1] text-white cursor-not-allowed shadow-none'
                                }`}
                        >
                            {activeTab === 'completed' ? t("patientList.viewImages") : t("common.nextStep")} <ChevronRight size={22} />
                        </button>
                    </div>
                </footer>

                {loadError && (
                    <FeedbackNotice className="absolute left-1/2 top-[88px] z-50 w-[520px] -translate-x-1/2 shadow-lg">
                        {loadError}
                    </FeedbackNotice>
                )}

                {/* Modal Integration - Constrained to this relative container */}
                <AddPatientScreen
                    isOpen={showAddModal}
                    onClose={() => setShowAddModal(false)}
                    onCreated={() => {
                        setShowAddModal(false);
                        void refreshPatients();
                    }}
                />
            </div>
    );
};

export default PatientListScreen;
