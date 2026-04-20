/**
 * 4D image source — URL generation, manifest loading, preloading.
 *
 * The preprocessed dataset lives at `public/dicom-4d/` (see
 * `ui-review/scripts/preprocess_4d.py`). Each phase has three MPR views
 * rendered as WebP; a cross-phase MIP (ITV) lives under `mip-itv/`.
 *
 * See `docs/4D-image-viewer-plan.md` for the data flow.
 */

export type FourDView = "axial" | "coronal" | "sagittal";

export interface FourDViewMeta {
    slices: number;
    width: number;
    height: number;
}

export interface FourDManifest {
    case: string;
    study: string;
    phases: number;
    phase_values: number[];
    views: Record<FourDView, FourDViewMeta>;
    mip: Record<FourDView, FourDViewMeta>;
    defaults: { ww: number; wl: number };
    spacing: { x: number; y: number; z: number };
}

const MANIFEST_URL = "/dicom-4d/manifest.json";

let manifestPromise: Promise<FourDManifest> | null = null;

export function loadFourDManifest(): Promise<FourDManifest> {
    if (!manifestPromise) {
        manifestPromise = fetch(MANIFEST_URL)
            .then((r) => {
                if (!r.ok) throw new Error(`Failed to load 4D manifest: ${r.status}`);
                return r.json() as Promise<FourDManifest>;
            })
            .catch((err) => {
                manifestPromise = null; // allow retry
                throw err;
            });
    }
    return manifestPromise;
}

/** 3-digit zero-padded slice index → "001", "142". Matches Python output. */
const pad3 = (n: number) => String(n).padStart(3, "0");

/**
 * URL for a specific phase/view/slice. Slice index is 1-based to match
 * the filenames on disk (`001.webp` ... `142.webp`).
 */
export function getFourDImageUrl(phase: number, view: FourDView, slice1Based: number): string {
    return `/dicom-4d/phase-${phase}/${view}/${pad3(slice1Based)}.webp`;
}

/** URL for the cross-phase MIP (ITV) image. */
export function getFourDMipUrl(view: FourDView, slice1Based: number): string {
    return `/dicom-4d/mip-itv/${view}/${pad3(slice1Based)}.webp`;
}

/**
 * Build the list of URLs for a phase's entire view (one URL per slice).
 * Used to drive the viewport's stack and slice scrubber.
 */
export function buildFourDImageUrls(
    manifest: FourDManifest,
    phase: number,
    view: FourDView,
): string[] {
    const count = manifest.views[view].slices;
    const urls: string[] = new Array(count);
    for (let i = 0; i < count; i++) {
        urls[i] = getFourDImageUrl(phase, view, i + 1);
    }
    return urls;
}

export function buildFourDMipUrls(manifest: FourDManifest, view: FourDView): string[] {
    const count = manifest.mip[view].slices;
    const urls: string[] = new Array(count);
    for (let i = 0; i < count; i++) {
        urls[i] = getFourDMipUrl(view, i + 1);
    }
    return urls;
}

// ── Preloading ────────────────────────────────────────────────────────────────
//
// Browser cache is our cache. `new Image().src = url` kicks off a fetch and the
// browser stores the decoded bitmap; subsequent `<img src=...>` hits are
// instant. We keep references in a module-level Set so the GC doesn't drop
// in-flight loads, then release them after load.

const inFlight = new Set<HTMLImageElement>();

function preloadOne(url: string): Promise<void> {
    return new Promise((resolve) => {
        const img = new Image();
        inFlight.add(img);
        const done = () => {
            inFlight.delete(img);
            resolve();
        };
        img.onload = done;
        img.onerror = done; // don't reject — best-effort
        img.src = url;
    });
}

/** Fire-and-forget warm of the given URLs. Returns a promise that resolves when all settle. */
export function preloadUrls(urls: string[]): Promise<void> {
    return Promise.all(urls.map(preloadOne)).then(() => undefined);
}

/**
 * On viewer mount: preload the mid axial slice of every phase so that the first
 * phase switch after the cine starts is instant.
 */
export function preloadPhaseFirstFrames(manifest: FourDManifest, view: FourDView = "axial"): Promise<void> {
    const mid = Math.floor(manifest.views[view].slices / 2) + 1;
    const urls: string[] = [];
    for (let p = 0; p < manifest.phases; p++) {
        urls.push(getFourDImageUrl(p, view, mid));
    }
    return preloadUrls(urls);
}

/** Warm every slice of one phase's view. Call when user lingers on a phase. */
export function preloadPhaseView(
    manifest: FourDManifest,
    phase: number,
    view: FourDView,
): Promise<void> {
    return preloadUrls(buildFourDImageUrls(manifest, phase, view));
}
