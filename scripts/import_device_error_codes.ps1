param(
    [Parameter(Mandatory = $true)]
    [string]$Source,

    [string]$Output = (Join-Path $PSScriptRoot "..\backend\resources\device_error_codes.json")
)

$ErrorActionPreference = "Stop"

function Get-NormalizedHeader([object]$Value) {
    if ($null -eq $Value) { return "" }
    return ([string]$Value).Replace("`r", " ").Replace("`n", " ").Trim()
}

function Get-ProfessionalMessage([string]$UiMessage, [string]$Meaning) {
    $message = if ([string]::IsNullOrWhiteSpace($UiMessage)) { $Meaning } else { $UiMessage }
    if ([string]::IsNullOrWhiteSpace($message)) { return "设备状态异常，请联系售后服务工程师。" }

    $message = $message.Trim()
    $message = $message.Replace("Json", "JSON").Replace("json", "JSON")
    $message = $message.Replace("联络售后工程师", "联系售后服务工程师")
    $message = $message.Replace("联系售后工程师", "联系售后服务工程师")
    $message = $message.Replace("紧急联系售后服务工程师", "立即联系售后服务工程师")
    $message = $message.Replace("通讯", "通信").Replace("报错", "异常").Replace("有问题", "异常")
    $message = [regex]::Replace($message, '详细错误请点击.+?查询.+?(?=[，,]|$)', '可查询详细错误信息')
    $message = [regex]::Replace($message, '如需恢复状态请点击.+?修复.+?(?=[，,]|$)', '如需恢复状态，请确认后执行修复操作')
    $message = $message.Replace("未正在进行当中", "当前未执行")
    $message = $message.Replace("正在进行当中", "正在执行")
    $message = $message.Replace("非执行中", "当前未执行")
    $message = $message.Replace("无法完成当前操作", "当前操作无法执行")
    $message = $message.Replace("输入参数不合法", "输入参数无效")
    $message = $message.Replace("不合法", "无效")
    $message = $message.Replace("请确认参数的准确性", "请核对参数")
    $message = $message.Replace("请确认当前操作是否合理", "请核对当前操作")
    $message = $message.Replace("请确认操作的正确性", "请核对当前操作")
    $message = $message.Replace("请确认整机情况", "请核对系统状态")
    $message = $message.Replace("请等待20分钟左右", "请等待约 20 分钟后重试")
    $message = $message.Replace("请耐心等待几分钟后再进行扫描操作", "请等待系统状态满足条件后再执行扫描操作")
    $message = [regex]::Replace($message, '请确认(.+?)的正确性', '请核对$1')
    $message = $message.Replace("请切换成", "请切换至")
    $message = $message.Replace("点击", "选择")
    $message = $message.Replace(",", "，").Replace("!", "。").Replace("！", "。").Replace(";", "；")
    $message = [regex]::Replace($message, "\s+", " ").Trim()
    $message = [regex]::Replace($message, "([，。；：])\s+", '$1')
    $message = [regex]::Replace($message, "。+", "。")

    if ($message -notmatch "[。；！？]$") { $message += "。" }
    return $message
}

function Get-NormalizedCode([object]$Value, [string]$SheetName, [int]$RowNumber) {
    if ($null -eq $Value) { return $null }
    $raw = ([string]$Value).Trim()
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
    if ($raw -notmatch '^0[xX]([0-9a-fA-F]{1,8})$') {
        throw "非法错误码 $raw（$SheetName 第 $RowNumber 行）"
    }
    return "0x$($Matches[1].PadLeft(8, '0').ToUpperInvariant())"
}

function Get-CellValue($Values, [hashtable]$Headers, [int]$RowNumber, [string[]]$Candidates) {
    foreach ($candidate in $Candidates) {
        if ($Headers.ContainsKey($candidate)) {
            $value = $Values[$RowNumber, $Headers[$candidate]]
            if ($null -ne $value) { return ([string]$value).Trim() }
        }
    }
    return ""
}

$sourceItem = Get-Item -LiteralPath $Source
$outputPath = [System.IO.Path]::GetFullPath($Output)
$outputDirectory = [System.IO.Path]::GetDirectoryName($outputPath)
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

$excel = $null
$workbook = $null
$records = [System.Collections.Generic.List[object]]::new()
$seenCodes = @{}

try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Open($sourceItem.FullName, 0, $true)

    foreach ($worksheet in $workbook.Worksheets) {
        $usedRange = $worksheet.UsedRange
        $values = $usedRange.Value2
        $rowCount = $usedRange.Rows.Count
        $columnCount = $usedRange.Columns.Count
        if ($rowCount -lt 2) { continue }

        $headers = @{}
        $headerRow = 0
        for ($candidateRow = 1; $candidateRow -le [Math]::Min(5, $rowCount); $candidateRow++) {
            for ($column = 1; $column -le $columnCount; $column++) {
                if ((Get-NormalizedHeader $values[$candidateRow, $column]) -eq "错误码(十六进制)") {
                    $headerRow = $candidateRow
                    break
                }
            }
            if ($headerRow -gt 0) { break }
        }
        if ($headerRow -eq 0) { continue }

        for ($column = 1; $column -le $columnCount; $column++) {
            $header = Get-NormalizedHeader $values[$headerRow, $column]
            if ($header) { $headers[$header] = $column }
        }

        for ($row = $headerRow + 1; $row -le $rowCount; $row++) {
            $sourceRow = $usedRange.Row + $row - 1
            $rawCode = Get-CellValue $values $headers $row @("错误码(十六进制)")
            $code = Get-NormalizedCode $rawCode $worksheet.Name $sourceRow
            if ($null -eq $code) { continue }

            $severityRaw = Get-CellValue $values $headers $row @("错误级别")
            $severity = switch -Regex ($severityRaw.Trim()) {
                '^Fatal$' { "fatal"; break }
                '^Error$' { "error"; break }
                '^Warning$' { "warning"; break }
                default { "category" }
            }
            # 仅导入可执行错误项；同码的模块标题行不进入运行时字典。
            if ($severity -eq "category") { continue }
            if ($seenCodes.ContainsKey($code)) {
                throw "错误码重复：$code（$($seenCodes[$code])；$($worksheet.Name) 第 $sourceRow 行）"
            }
            $uiMessage = Get-CellValue $values $headers $row @("UI显示")
            $meaning = Get-CellValue $values $headers $row @("含义", "含义(原因)")
            $action = Get-CellValue $values $headers $row @("对策&方法", "对策&恢复", "对策")

            $records.Add([ordered]@{
                code = $code
                raw_code = $rawCode
                module = [regex]::Replace($worksheet.Name, '^[0-9A-Fa-f]{2}_', '')
                severity = $severity
                professional_message = Get-ProfessionalMessage $uiMessage $meaning
                source_ui_message = $uiMessage
                meaning = $meaning
                action = $action
                firmware_code = Get-CellValue $values $headers $row @("Firmware Code")
                read_command = Get-CellValue $values $headers $row @("读取指令", "读取指令(详细内容)")
                repair_command = Get-CellValue $values $headers $row @("修复指令")
                repair_time = Get-CellValue $values $headers $row @("修复时间")
                source_sheet = $worksheet.Name
                source_row = $sourceRow
            })
            $seenCodes[$code] = "$($worksheet.Name) 第 $sourceRow 行"
        }
    }
}
finally {
    if ($workbook) { $workbook.Close($false) }
    if ($excel) { $excel.Quit() }
    if ($workbook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
    if ($excel) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

$payload = [ordered]@{
    schema_version = 1
    source_file = $sourceItem.Name
    records = @($records | Sort-Object { $_.code }, { $_.module })
}
$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($outputPath, $json, [System.Text.UTF8Encoding]::new($false))
Write-Output "Generated $($records.Count) error-code records: $outputPath"
