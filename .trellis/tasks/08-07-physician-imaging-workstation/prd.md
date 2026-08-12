# 医生端影像后处理工作站

## Goal

在 `feat/wt32-web-1920` 分支建立一个独立的医生端 CT 影像后处理工作站。它服务于影像浏览、后处理、测量标注、AI 辅助复核与报告草稿辅助，不承担扫描控制、设备控制、剂量批准或临床诊断结论。

## Confirmed Facts

- `master` 分支的 WT32 是扫描控制台原型；本分支不延续其患者登记、协议选择和扫描执行作为核心工作流。
- 现有前端已具备可复用的 Cornerstone 2D、MPR、MIP、MinIP、Avg、体绘制、视口联动、测量和标注基础能力，入口为 `/image-viewer`。
- 现有图像浏览模块的批准范围仅为扫描后质量确认；医生端诊断工作站是本分支的新产品边界，不能把原有查看器直接包装为医生端产品。
- 后端已有演示性质的 AI 作业接口：模型提供者可在 mock 与云端 provider 间切换，并通过异步作业和 SSE 返回进度与统一结果。
- 后续需要接入多个外部模型/API，包括智能报告解读与自动分割。模型结果必须作为可追溯、可复核的辅助信息，而不是诊断结论。

## Requirements

- 建立面向 1920 × 1080 桌面显示器的医生工作站信息架构：检查列表、患者/检查上下文、序列浏览、主影像视口、工具、AI 结果和报告工作区有明确职责。
- 保留并改造现有影像渲染能力，使 2D、MPR、投影和体绘制形成医生端连续工作流。
- 将 AI 能力设计为独立于供应商的任务和结果契约；前端不得依赖某个模型或云服务的私有响应结构。
- AI 报告解读、自动分割和后续模型结果必须显示来源、模型/版本、运行状态、适用序列和人工复核状态。
- 报告能力在一期仅产生可编辑的草稿/辅助摘要；任何文本和影像结果都必须标注为供复核的原型输出。
- 影像、测量、标注和 AI 结果的显示与保存边界必须清晰，不能修改原始 DICOM 或扫描会话数据。
- 继续遵守 WT32 原型边界：不得表示真实设备控制、临床诊断、治疗建议、最终剂量计算或临床审批。

## Initial Scope Candidates

- 医生端检查/序列工作台与 2D、MPR、3D 阅片。
- 测量、文本标注、视口布局和工作状态保存。
- 多模型 AI 任务框架：提交、进度、失败、取消、结果版本和人工复核。
- 自动分割结果的可见性、叠加层、接受/忽略状态。
- 报告解读结果与可编辑报告草稿的边界。

## Phase 1 Clinical Workspaces

Each clinical application is an independently composed workflow, not a mode inside one interchangeable workstation. Application selection belongs to the worklist/recommendation step. Once a case opens at an application route, its workflow is fixed for that workspace session. The shared platform provides study context, DICOM viewing, artifact provenance, human review, and draft persistence; each application owns its task sequence, measurements, analysis panels, result vocabulary, and report-template fields.

- Chest CT: pulmonary nodule review is the Phase 1 end-to-end reference application, including nodule-focused series review, assistive segmentation overlays, AI findings review, and report-draft assistance.
- Whole-body bone CT: skeletal review, including bone-focused display presets, assistive segmentation or findings overlays, AI findings review, and report-draft assistance.
- Both workspaces share one physician-workstation core: study and series context, 2D/MPR/3D viewing, annotations, AI jobs, review status, and draft-report workflow.
- The next strategic focus is cardiac CT, especially coronary artery workflows and other high-frequency clinical scenarios. Cardiac-specific tools remain out of the Phase 1 delivery but must not be blocked by its architecture.

## Application Entry Model

- Entry is application-oriented rather than a generic "open image" action.
- Phase 1 uses a study-first plus application-recommendation model: after a study is selected from the worklist, the workstation recommends compatible applications from study and series metadata; the physician can always choose another compatible application explicitly.
- General Review opens a study with the shared 2D/MPR/3D, series, measurement, and annotation tools.
- Pulmonary Nodule opens a chest CT review workspace with lung-focused series and display presets, assistive nodule segmentation/findings review, and a nodule report draft.
- Whole-body Bone opens a skeletal review workspace with bone-focused display presets, assistive segmentation/findings review, and a skeletal report draft.
- Cardiac Coronary remains a visible planned application entry. It is not a Phase 1 placeholder inside the lung or bone workspaces; its later tools, AI contracts, and report structure must be independently extensible.

## Data Architecture Principles

- Keep source imaging data separate from physician-workstation data. Existing `Patient`, `ScanExam`, `ScanSession`, and reconstructed series remain read-only source context; the physician application must not mutate raw images or scanner-session records.
- Introduce a stable imaging-study facade so Phase 1 can reference the existing WT32 data model while a later PACS or DICOMweb adapter can provide the same study and series contracts without rewriting application workflows.
- Model each clinical application as a separate `ApplicationCase` for one imaging study. Shared study data stays generic; lung, bone, and future coronary requirements live in application-specific capability and artifact contracts instead of hard-coded fields on the study.
- Separate transient per-user workspace state (layout, active series, viewport and tool state) from durable clinical-work artifacts (measurements, annotations, segmentation review, AI review, and report drafts).
- Normalize all external-model execution through provider-neutral `AiRun` and `AiArtifact` contracts. Every result records its source study/series, provider, model/version, request contract version, status, and human-review state; provider-specific response formats stay behind adapters.
- Treat AI findings, segmentations, and report text as reviewable assistive artifacts. Human accept, edit, reject, and ignore decisions are stored independently from the original AI result, preserving traceability without implying diagnosis.
- Keep report work as versioned drafts with evidence references to annotations and reviewed AI artifacts. Drafts are not formal clinical reports and never write back into source image or scanner data.
- Phase 1 persists physician-workstation artifacts by imaging study, physician identity, and clinical application. Page refresh or a later sign-in must restore the user's workspace context, annotations, measurements, AI review decisions, and draft-report history.
- Durable artifacts require authorship, creation/update timestamps, application context, and revision history. Transient viewport interactions may be stored separately and restored opportunistically without being treated as a clinical record.

## Sample Imaging Data Boundary

- Raw public DICOM is managed in the dedicated local directory `C:\\STN\\projects\\WT32-data\\physician-workstation\\`, outside frontend assets and database fixtures. It is de-identified, ignored by Git, and used only to validate this prototype's image-loading and workstation workflow.
- The first supplied sample set must support the pulmonary-nodule reference application. It must include a complete chest CT DICOM series with spatial metadata suitable for stack viewing and MPR; where available, include a matching nodule annotation or segmentation reference as separate assistive input.
- A later independently managed whole-body or lower-extremity CT set will validate the bone application. No sample data is to be represented as a real patient study or as diagnostic ground truth.
- The first requested data package is the paired TCIA Radiomic Feature Standards Patient Datasets set: original LIDC-IDRI chest CT images (10 subjects, DICOM) plus matching DICOM SEG objects (10 subjects). Do not download the full LIDC-IDRI collection or the separate 13-subject source-analysis tables for the initial workstation build.
- The first locally verified sample is `lidc-idri-0314`: one 275-instance chest CT series, four manual DICOM SEG reference objects, nine historical candidate SEG objects, and four linked DICOM SR objects. A local import manifest distinguishes these roles and records their UID relationships without modifying the raw download.
- The nine historical candidate segmentations are included in the Phase 1 pulmonary-nodule review as external comparison artifacts. They must be visually and semantically distinct from future WT32 model outputs and from the four manual reference annotations. The workstation supports comparison and human review only; it does not designate any source as a diagnostic ground truth.
- The first runnable AI workflow uses a deterministic in-process WT32 mock provider to exercise submission, progress, segmentation result, comparison, and human review without an external-model dependency. This is test infrastructure, not a local inference model.
- DeepSeek API is the planned first cloud provider for report-text interpretation and draft-assistance features. It is integrated through a provider adapter and must preserve the workstation's stable result contracts, audit fields, and human-review requirement.
- Image segmentation remains a separate image-model capability. The architecture must not represent a text-model response as a DICOM segmentation result; a segmentation provider must produce an explicit, spatially referenced segmentation artifact before it can be overlaid or compared. Open-source segmentation runtimes are preferred for prototype evaluation, subject to per-model licensing, data-format, and hardware verification.
- TotalSegmentator is the first open-source segmentation-provider candidate for both Phase 1 applications: use its `lung_nodules` task for pulmonary-nodule prototype evaluation and its body/bone-capable tasks for skeletal prototype evaluation. The two applications share the adapter and artifact contracts but retain separate application configuration, display presets, review semantics, and acceptance checks.

## Explicitly Out of Scope Until Approved

- 真正 PACS、RIS、EMR 或 DICOMweb 生产集成。
- 对真实患者数据、隐私合规、医疗器械认证或临床诊断准确性的承诺。
- 将 AI 输出自动写入正式临床报告或自动触发治疗/检查决策。
- 在未定义数据生命周期、访问控制和审计边界前接入真实第三方模型 API。

## Acceptance Criteria

- [ ] 新工作站的页面、导航与术语围绕医生阅片/后处理，而不是扫描控制流程。
- [ ] 一个检查可在同一工作台完成序列选择、2D/MPR/3D 浏览、工具操作和 AI 辅助复核。
- [ ] 任一 AI 结果均能显示来源、版本、状态、适用影像与人工复核状态；供应商不可用时不阻断基础阅片。
- [ ] 自动分割和报告草稿均以可审阅、可忽略的辅助结果呈现，且不修改原始数据。
- [ ] 所有原型性 AI/报告信息使用“参考”“模拟”或“需人工确认”等受限措辞，不输出诊断结论。
- [ ] 核心桌面工作区在 1920 × 1080 下可同时呈现影像、序列上下文和 AI/报告上下文，不以全局等比缩放替代布局。

## Visual Direction

The WT32 physician workstation is a precision-imaging console, not a generic dark SaaS dashboard. It uses a restrained typographic WT32 mark, rigid panel geometry, thin ruled separators, indexed sections, and compact provenance ledgers. Aqua is reserved for the active image/review focus; review outcomes retain explicit text and use limited clinical status color. Avoid oversized soft cards, prominent pills, decorative gradients, glass effects, or generic "AI assistant" visual language. The product name shown in the shell is `WT32 IMAGE ANALYSIS`, rather than a generic "Clinical Workspace" label.

- The physician UI is independently designed for a professional imaging workstation.
- The image viewport is the visual center; tools, study context, AI review, and report drafting are stable work areas.
- Do not use chat-assistant motifs, marketing cards, glass effects, decorative gradients, or glow treatments.

## Open Product Decision

一期需要选定一个首发临床场景，作为阅片布局、分割对象、报告草稿字段和 AI 评估标准的共同锚点。
