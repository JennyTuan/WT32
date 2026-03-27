# UI Review Gallery（设计评审用界面集合工程）

## 🎯 项目目的

本项目是一个 **纯前端界面展示容器**，用于：

* 汇总系统的所有界面
* 用于设计评审
* 与设计师讨论交互细节
* 进行 UI 结构验证

⚠️ 本工程 **不包含真实业务逻辑、不接后端、不实现真实跳转流程**
所有页面仅用于视觉与交互结构展示。

# 🏗 技术栈

* React + Vite
* TypeScript
* TailwindCSS
* lucide-react（图标库）

---

# 📁 项目结构规范（AI 必须遵守）

```
src/
 ├── screens/              # 所有独立界面
 │    ├── PatientListScreen.tsx
 │    ├── XxxScreen.tsx
 │    └── ...
 │
 ├── Gallery.tsx           # 界面集合展示页
 ├── App.tsx               # 入口，仅渲染 Gallery
 └── main.tsx
```

---

# 🧩 界面接入规则（非常重要）

## 1️⃣ 每个界面必须是独立组件

示例：

```tsx
const PatientListScreen = () => {
  return (
    <div>
      ...
    </div>
  );
};

export default PatientListScreen;
```

❌ 不允许再使用 `App` 作为组件名
❌ 不允许直接修改 `App.tsx`

---

## 2️⃣ 所有界面必须放在

```
src/screens/
```

---

## 3️⃣ 在 Gallery.tsx 中注册

```tsx
import PatientListScreen from "./screens/PatientListScreen";

const screens = [
  {
    key: "patient_list",
    name: "患者列表",
    component: <PatientListScreen />
  }
];
```

新增界面时只允许：

* 新建 Screen 文件
* 在 Gallery 中添加一条注册项

不得破坏现有结构。

---

# 🧠 AI 生成代码时必须遵守

当 AI 为本工程生成界面时：

1. 必须生成独立 Screen 组件
2. 不允许包含真实 API 调用
3. 所有数据必须使用 mock 数据
4. 不使用 React Router（当前阶段）
5. 不引入新的 UI 框架
6. 必须使用 Tailwind 进行样式
7. 图标统一使用 lucide-react

---

# 🎨 界面风格统一要求

* 主界面固定尺寸：1024x768
* 背景浅蓝灰色
* 卡片式布局
* 圆角统一 rounded-md / rounded-lg
* 统一主色：#4D94FF
* 字体偏医疗系统风格（稳重 / 清晰）

---

# 🚫 当前阶段禁止事项

* 不做页面间跳转
* 不引入 Zustand / Redux
* 不接入真实数据
* 不改造项目结构
* 不引入 UI 组件库（如 AntD）

---

# 🔮 未来扩展方向（暂不实现）

* 引入 React Router
* 支持全屏切换
* 支持缩放比例切换
* 支持界面截图导出
* 接入真实 API

---

# 🛠 启动项目

```bash
npm install
npm run dev
```

# 中文编码建议

如果你使用 Codex CLI 或 PowerShell 修改包含大量中文的界面文件，建议先把当前终端切到 UTF-8，再进行编辑或运行命令。

```powershell
. .\scripts\Enable-Utf8Terminal.ps1
```

执行后应看到：

```text
InputEncoding : utf-8
OutputEncoding: utf-8
Code page     : 65001
```

说明：

* 当前项目里大部分源码文件已经是 UTF-8。
* 如果终端仍停留在 `936`（GBK），即使文件本身没坏，也可能在 Codex CLI 编辑、终端输出、日志查看时出现乱码。
* 若某个文件已经保存成乱码内容，切换终端到 UTF-8 只能防止继续损坏，不能自动恢复历史乱码文本。

---

# 📌 本工程定位总结

这是一个：

> UI 设计评审容器
> 不是业务系统
> 不是生产系统
> 不是后端对接项目

---

# 📣 给 AI 的一句话说明

> 这是一个用于设计评审的 React UI 容器工程。
> 所有页面必须作为独立 Screen 组件接入，不实现真实业务逻辑，不修改项目结构。
