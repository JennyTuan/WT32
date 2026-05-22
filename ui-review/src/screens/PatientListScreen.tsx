import { useEffect, useState } from 'react';
import {
    Sun,
    Plus,
    Trash2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Siren,
    RefreshCw,
    Search,
    Upload,
    Download,
    Eye,
    Flame,
    Image as ImageIcon,
    ChevronsLeft,
    ChevronsRight
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import AddPatientScreen from './AddPatientScreen';
import NetworkStatusButton from '../components/NetworkStatusButton';
import PatientHeaderCard from '../components/PatientHeaderCard';
import SystemMenuButton from '../components/SystemMenuButton';
import { saveSelectedPatient } from '../lib/patientSession';
import {
    listPatients,
    calcAgeFromBirthDate,
    mapGenderToZh,
    mapStatusToZh,
    type ApiPatient,
} from '../lib/patientsApi';
import { generateMockScanResult } from '../lib/fourDTypes';
import { saveSelectedScanSessionId } from '../lib/scanSession';

type CheckStatus = '待进行' | '已完成' | '已终止';

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
};

const mapApiPatientToRecord = (p: ApiPatient, index: number): PatientRecord => ({
    id: p.id,
    serial: index + 1,
    patientId: p.patient_id,
    name: p.name,
    gender: mapGenderToZh(p.gender),
    age: calcAgeFromBirthDate(p.birth_date),
    checkStatus: mapStatusToZh(p.latest_scan_status),
    latestSessionId: p.latest_scan_session_id,
    latestAcquisitionType: p.latest_scan_acquisition_type,
    latestScanMode: p.latest_scan_mode,
});

const PatientListScreen = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'completed'
    const [patients, setPatients] = useState<PatientRecord[]>([]);
    const [selectedRows, setSelectedRows] = useState<number[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [isNameMasked, setIsNameMasked] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const refreshPatients = async () => {
        try {
            const apiList = await listPatients();
            setPatients(apiList.map(mapApiPatientToRecord));
            setLoadError(null);
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : '加载患者列表失败');
        }
    };

    useEffect(() => {
        void refreshPatients();
    }, [location.key]);

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
            ? isTerminalStatus(patient.checkStatus)
            : !isTerminalStatus(patient.checkStatus);
        const matchesQuery = normalizedQuery.length === 0
            || patient.name.toLowerCase().includes(normalizedQuery)
            || patient.patientId.toLowerCase().includes(normalizedQuery);

        return matchesTab && matchesQuery;
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

    useEffect(() => {
        if (selectedRows.length > 0 && selectedPatients.length === 0) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelectedRows([]);
        }
    }, [selectedPatients.length, selectedRows.length]);

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative">

            {/* 主容器 1024x768 */}

                {/* 1. Header (保持原风格) */}
                <header className="flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
                    <div className="flex items-center gap-3">
                        <PatientHeaderCard
                            name={selectedPatient ? maskName(selectedPatient.name) : null}
                            patientId={selectedPatient?.patientId ?? null}
                        />
                        <div className="flex flex-col gap-0.5 text-[#546E7A] opacity-60">
                            <div className="flex items-center gap-1 text-[11px] font-bold"><img src="/机床.svg" alt="机床" className="w-3.5 h-3.5" /><span>0</span></div>
                            <div className="flex items-center gap-1 text-[11px] font-bold"><img src="/机架角度.svg" alt="机架角度" className="w-3.5 h-3.5" /><span>0</span></div>
                            <div className="flex items-center gap-1 text-[11px] font-bold"><img src="/球管.svg" alt="球管" className="w-3.5 h-3.5" /><span>0%</span></div>
                        </div>
                    </div>

                    <div className="text-center">
                        <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">13:52</div>
                        <div className="text-[12px] text-[#546E7A] font-medium mt-1 uppercase opacity-80">2月26日 周四</div>
                    </div>

                    <div className="flex items-center gap-5 pr-2">
                        <div className="p-1 text-[#D32F2F] cursor-pointer hover:opacity-70"><Siren size={30} strokeWidth={1.8} /></div>
                        <NetworkStatusButton />
                        <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                            <Sun size={24} />
                        </div>
                        <SystemMenuButton iconSize={24} badgeCount={10} />
                    </div>
                </header>

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
                                        onClick={() => setActiveTab('pending')}
                                        className={`px-8 h-[32px] text-[13px] font-bold transition-all rounded-md ${activeTab === 'pending' ? 'bg-[#4D94FF] text-white shadow-sm' : 'text-[#4D94FF] hover:bg-white/50'}`}
                                    >
                                        未完成
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('completed')}
                                        className={`px-8 h-[32px] text-[13px] font-bold transition-all rounded-md ${activeTab === 'completed' ? 'bg-[#4D94FF] text-white shadow-sm' : 'text-[#4D94FF] hover:bg-white/50'}`}
                                    >
                                        已完成
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                {/* 快速操作图标 - 已移动至此处 */}
                                <div className="flex items-center gap-4 text-[#90A4AE]">
                                    <button
                                        type="button"
                                        title="刷新"
                                        onClick={() => void refreshPatients()}
                                        className="text-[#90A4AE] hover:text-blue-500 transition-colors"
                                    >
                                        <RefreshCw size={18} />
                                    </button>
                                    <button
                                        type="button"
                                        title={isNameMasked ? '关闭脱敏' : '开启脱敏'}
                                        onClick={() => setIsNameMasked((current) => !current)}
                                        className={`transition-colors ${isNameMasked ? 'text-[#4D94FF]' : 'text-[#90A4AE] hover:text-blue-500'}`}
                                    >
                                        <Eye size={18} />
                                    </button>
                                    <button
                                        type="button"
                                        title="导入"
                                        className="text-[#90A4AE] hover:text-blue-500 transition-colors"
                                    >
                                        <Download size={18} />
                                    </button>
                                </div>

                                {/* 搜索框 */}
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="搜索患者姓名、ID..."
                                        className="w-[240px] h-[36px] pl-10 pr-4 bg-white border border-[#B0C4DE] rounded-md text-[13px] focus:outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/20"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#90A4AE]" size={16} />
                                </div>

                                {/* 功能按钮 */}
                                <div className="flex gap-2">
                                    <button
                                        title="新增"
                                        onClick={() => setShowAddModal(true)}
                                        className="w-[36px] h-[36px] bg-[#4D94FF] text-white rounded-md flex items-center justify-center shadow-sm hover:bg-blue-600 active:scale-95 transition-all"
                                    >
                                        <Plus size={18} />
                                    </button>
                                    <button
                                        title={canExportSelected ? '导出' : '请选择患者后导出'}
                                        disabled={!canExportSelected}
                                        className={`w-[36px] h-[36px] rounded-md flex items-center justify-center transition-all ${canExportSelected
                                            ? 'bg-white border border-[#B0C4DE] text-[#546E7A] hover:bg-gray-50 active:scale-95'
                                            : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#B0BEC5] cursor-not-allowed'
                                            }`}
                                    >
                                        <Upload size={18} />
                                    </button>
                                    <button
                                        title={canDeleteSelected ? '删除' : '请选择非已完成患者'}
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
                                            <th className="px-4 text-left border-r border-white/10">序号 <ChevronDown size={14} className="inline ml-1 opacity-60" /></th>
                                            <th className="px-4 text-left border-r border-white/10">患者ID</th>
                                            <th className="px-4 text-left border-r border-white/10">姓名</th>
                                            <th className="px-4 text-left border-r border-white/10">性别</th>
                                            <th className="px-4 text-left border-r border-white/10">年龄</th>
                                            <th className="px-4 text-center">{activeTab === 'completed' ? '图像状态' : '检查状态'}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {filteredPatients.map((patient) => (
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
                                                <td className="px-4">{patient.gender}</td>
                                                <td className="px-4">{patient.age}</td>
                                                <td className="text-center">
                                                    {activeTab === 'completed' && patient.checkStatus === '已完成' ? (
                                                        <button
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                if (patient.latestSessionId) {
                                                                    saveSelectedScanSessionId(patient.latestSessionId);
                                                                }
                                                                const isFourD =
                                                                    patient.latestAcquisitionType === 'four_d'
                                                                    || patient.latestScanMode === '4d';
                                                                if (isFourD) {
                                                                    navigate('/image-viewer', {
                                                                        state: {
                                                                            scanResult: generateMockScanResult(9, 10, 165.0),
                                                                            showSliceLoadingBeforeImageLoad: false,
                                                                            initialBrowseMode: 'phase',
                                                                        },
                                                                    });
                                                                } else {
                                                                    navigate('/image-viewer');
                                                                }
                                                            }}
                                                            className="inline-flex h-[24px] px-2 rounded-full items-center justify-center gap-1 text-[11px] font-bold bg-[#E3F2FD] text-[#1E88E5] border border-[#BBDEFB]"
                                                        >
                                                            <ImageIcon size={12} />
                                                            {patient.latestAcquisitionType === 'four_d' ? '查看 4D 图像' : '可查看图像'}
                                                        </button>
                                                    ) : (
                                                        <span className={`inline-flex min-w-[62px] h-[24px] px-2 rounded-full items-center justify-center text-[11px] font-bold ${checkStatusClass[patient.checkStatus]}`}>
                                                            {patient.checkStatus}
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
                                    <span className="opacity-70">每页显示:</span>
                                    <div className="flex items-center gap-2 px-2 py-1 border border-[#B0C4DE] rounded bg-white cursor-pointer hover:border-blue-400">
                                        <span className="font-bold">10</span>
                                        <ChevronDown size={14} className="text-[#90A4AE]" />
                                    </div>
                                </div>

                                <div className="text-[12px] text-[#546E7A]">
                                    已选择 <span className="font-bold">{visibleSelectedCount}</span> / 当前列表 <span className="font-bold">{filteredPatients.length}</span> 条
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
                            <ChevronLeft size={22} /> 上一步
                        </button>
                    </div>
                    <div className="flex-1 flex justify-end">
                        <button
                            onClick={() => {
                                if (canProceed) {
                                    if (selectedPatient) {
                                        saveSelectedPatient({
                                            id: selectedPatient.id,
                                            serial: selectedPatient.serial,
                                            patientId: selectedPatient.patientId,
                                            name: selectedPatient.name,
                                            gender: selectedPatient.gender,
                                            age: selectedPatient.age,
                                        });
                                    }
                                    navigate('/protocol-select');
                                }
                            }}
                            disabled={!canProceed}
                            className={`flex items-center gap-2 px-12 h-[56px] font-bold rounded-md uppercase text-[14px] transition-all ${canProceed
                                ? 'bg-[#4D94FF] text-white shadow-lg hover:bg-blue-600 active:scale-95'
                                : 'bg-[#CBD5E1] text-white cursor-not-allowed shadow-none'
                                }`}
                        >
                            下一步 <ChevronRight size={22} />
                        </button>
                    </div>
                </footer>

                {loadError && (
                    <div className="absolute top-[88px] left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-50 border border-red-200 text-red-600 text-[12px] rounded shadow">
                        {loadError}
                    </div>
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
