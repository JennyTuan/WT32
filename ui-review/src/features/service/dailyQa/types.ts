export type PhantomType = "水模" | "气模";

export type QAStatus = "PASS" | "FAIL";

export type MetricKey = "noise" | "uniformity" | "accuracy";

export type RoiPoint = {
  x: number;
  y: number;
};

export type DailyQaMetricResult = {
  key: MetricKey;
  title: string;
  limit: string;
  actual: string;
  status: QAStatus;
  summary: string;
};

export type QACardItem = DailyQaMetricResult & {
  viewportLabel: string;
  roiPoints: RoiPoint[];
  roiShape: "circle" | "dot";
};

export type PhantomImageData = {
  id: string;
  acquiredAt: string;
  phantomType: PhantomType;
  seed: number;
};

export type DailyQaRecord = {
  id: string;
  date: string;
  time: string;
  phantomType: PhantomType;
  operator: string;
  deviceName: string;
  judgment: QAStatus;
  noiseVal: number;
  uniformityVal: number;
  accuracyVal: number;
  cards: DailyQaMetricResult[];
  image: PhantomImageData;
};
