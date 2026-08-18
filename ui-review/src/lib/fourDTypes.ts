/**
 * 4D 扫描后处理共享类型定义
 *
 * 数据流：
 *   FourDDiagnosticConfirmScreen
 *     → FourDRescanSelectScreen  (scanResult + phaseSelections)
 *     → ImageLoadScreen / PhaseFilterScreen
 *     → ViewScreen
 */

/** 单个 床位×相位 格子的数据 */
export interface BedPhaseCell {
  /** 该格子采集到的帧数（正常=1，>1 表示相位冗余） */
  frameCount: number;
  /** 当前选中的帧索引（0-based） */
  selectedFrame: number;
}

/** 扫描完成后产生的原始结果，由 FourDDiagnosticConfirmScreen 生成并向后传递 */
export interface FourDScanResult {
  /** 总床位数 */
  bedCount: number;
  /** 相位数（默认 10） */
  phaseCount: number;
  /** 扫描长度 (mm) */
  scanLength: number;
  /**
   * 相位矩阵：phaseMatrix[bedIdx][phaseIdx]
   * 行=床位，列=相位
   */
  phaseMatrix: BedPhaseCell[][];
  /** 本次扫描是否发生了暂停重扫 */
  rescanOccurred: boolean;
  /**
   * 重扫涉及的床位范围（0-based，inclusive）。
   * null 表示未发生重扫。
   */
  rescanBedRange: [number, number] | null;
}

/** 相位筛选结果：每个有冗余的格子选哪帧 */
export type PhaseSelections = Record<string, number>; // key: `${bedIdx}-${phaseIdx}`

/** 重扫区域选择：每个冲突床位选哪套数据 */
export type RescanChoices = Record<number, "first" | "rescan">; // key: bedIdx

export interface FourDWaveformControlPoint {
  id: number;
  kind: "peak" | "valley";
  t: number;
  value: number;
}

export interface FourDBedDataSelection {
  candidateId: string;
  waveformPoints: FourDWaveformControlPoint[];
  disabledCycleIds: number[];
}

export interface FourDDataReview {
  bedSelections: Record<number, FourDBedDataSelection>;
  phaseMatrix: BedPhaseCell[][];
}

/** 贯穿整个后处理流程的完整状态（navigate state） */
export interface FourDPostScanState {
  /** 持久化结果所属的扫描会话；缺失时不得作为已关联结果进入查看器。 */
  scanSessionId?: number;
  /** 持久化结果对应的 4D 目标序列。 */
  targetSeriesId?: number;
  /** 后端乐观锁版本；用于刷新恢复和避免旧页面覆盖新选择。 */
  resultVersion?: number;
  /** 鏈嶅姟绔凡鎻愪氦鐨勫悗澶勭悊闃舵锛岀敤浜庡埛鏂版仮澶嶅拰闃叉闃舵鍥為€€銆?*/
  workflowStage?: "acquired" | "data_reviewed" | "rescan_selected" | "phase_selected" | "ready";
  /** 鎵弿缁撴灉鏄惧紡缁戝畾鐨勬ā鎷熷奖鍍忔竻鍗曪紱涓嶅緱杩愯鏃舵帹鏂叾浠栨暟鎹泦銆?*/
  imageSourceId?: "fourd-engineer";
  imageSourceVersion?: 1;
  sourceAttemptId?: number;
  scanResult: FourDScanResult;
  dataReview?: FourDDataReview;
  /** 相位筛选完成后填充 */
  phaseSelections?: PhaseSelections;
  /** 重扫选择完成后填充 */
  rescanChoices?: RescanChoices;
  /** 4D 扫描结束后是否先在图示界面展示切片加载过程，再跳转至 image-load */
  showSliceLoadingBeforeImageLoad?: boolean;
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

/**
 * 生成 Mock 扫描结果（原型阶段由扫描界面调用）。
 * 真实实现时替换为后端接口返回的数据。
 */
export function generateMockScanResult(
  bedCount: number,
  phaseCount = 10,
  scanLength = 165.0
): FourDScanResult {
  // 模拟部分床位的某些相位出现 2 帧冗余
  const conflictBeds = new Set([1, 3, 4]);
  const conflictPhases = new Set([2, 5, 7]);

  const phaseMatrix: BedPhaseCell[][] = Array.from({ length: bedCount }, (_, bedIdx) =>
    Array.from({ length: phaseCount }, (_, phaseIdx) => ({
      frameCount:
        conflictBeds.has(bedIdx) && conflictPhases.has(phaseIdx) ? 2 : 1,
      selectedFrame: 0,
    }))
  );

  // 模拟重扫：只有床位足够多时才触发（覆盖床位 4-6）
  const rescanOccurred = bedCount > 7;
  const rescanBedRange: [number, number] | null = rescanOccurred ? [4, 6] : null;

  return {
    bedCount,
    phaseCount,
    scanLength,
    phaseMatrix,
    rescanOccurred,
    rescanBedRange,
  };
}
