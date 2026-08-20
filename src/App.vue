<template>
  <div class="app-wrapper" :data-theme="theme">
    <div class="app-card">
      <!-- 标题栏 -->
      <header class="card-header">
        <div class="title-tab">
          <div class="tab-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <path d="M7 12h10M7 16h6" stroke-linecap="round" />
            </svg>
          </div>
          <span class="tab-title">计算稿纸</span>
        </div>

        <div class="header-actions">
          <button class="icon-btn" @click="toggleTheme" :title="theme === 'light' ? '切换暗色' : '切换亮色'">
            <svg v-if="theme === 'light'" class="i-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            <svg v-else class="i-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>
        </div>
      </header>

      <!-- 稿纸标签 -->
      <div class="sheet-bar">
        <div class="sheet-tabs">
          <div
            v-for="(sheet, sIdx) in sheets"
            :key="sheet.id"
            class="sheet-tab"
            :class="{ active: activeSheetIndex === sIdx, editing: editingIndex === sIdx }"
            @click="switchSheet(sIdx)"
            @dblclick="startRename(sIdx)"
          >
            <input
              v-if="editingIndex === sIdx"
              :ref="(el) => setRenameInput(el, sIdx)"
              v-model="editingName"
              class="rename-input"
              @keyup.enter="commitRename"
              @keyup.esc="cancelRename"
              @blur="commitRename"
              @click.stop
            />
            <span v-else class="sheet-name" :title="sheet.name">{{ sheet.name }}</span>
            <span v-if="editingIndex !== sIdx" class="sheet-edit" title="重命名（双击标签也可）" @click.stop="startRename(sIdx)">✎</span>
            <span v-if="sheets.length > 1 && editingIndex !== sIdx" class="sheet-del" @click.stop="delSheet(sIdx)">×</span>
          </div>
        </div>
      </div>

      <!-- 演算列表 -->
      <div class="paper-body" ref="paperBody">
        <!-- 空状态引导 -->
        <div v-if="guideOpen && isSheetEmpty" class="guide-card">
          <div class="guide-title">欢迎使用计算稿纸 👋</div>
          <p class="guide-sub">多行算式实时计算，回车跳下一行；支持变量、备注、多稿纸，数据自动保存在本机。</p>
          <div class="guide-examples">
            <div class="guide-example">· 算式：<code>55+888+999</code> → <code>= 1,942</code></div>
            <div class="guide-example">· 变量：<code>tax=0.13</code>，下一行用 <code>1000*tax</code></div>
            <div class="guide-example">· 快捷键：<code>Ctrl+Z</code> 撤销 · <code>Tab</code> 算式⇄备注 · <code>↑</code> 调历史</div>
          </div>
          <div class="guide-actions">
            <button class="modal-btn primary" @click="loadExample">载入示例</button>
            <button class="modal-btn" @click="dismissGuide">开始使用</button>
          </div>
        </div>

        <div class="calc-list">
          <div
            v-for="(line, lIdx) in currentSheet.lines"
            :key="line.id"
            class="calc-row"
            :class="{ focused: focusedLine === lIdx, dragging: dragIndex === lIdx }"
            draggable="true"
            @dragstart="onDragStart($event, lIdx)"
            @dragover.prevent="dragIndex = lIdx"
            @drop="onDrop($event, lIdx)"
            @dragend="onDragEnd"
          >
            <div class="row-main">
              <span class="drag-handle" title="拖动排序">⋮⋮</span>
              <div class="expr-wrap">
                <input
                  :ref="(el) => setExprRef(el, lIdx)"
                  v-model="line.expr"
                  @input="onExprInput(lIdx)"
                  @keydown.enter.prevent="onExprEnter(lIdx)"
                  @keydown.tab.prevent="onExprTab(lIdx)"
                  @keydown.up.prevent="focusPrevRow(lIdx)"
                  @keydown.down.prevent="focusNextRow(lIdx)"
                  @focus="focusedLine = lIdx"
                  @blur="onExprBlur(lIdx)"
                  class="expr-input"
                  placeholder="计算公式（回车跳下一行）"
                  spellcheck="false"
                />
                <!-- 函数自动补全下拉 -->
                <div v-if="completion && completion.lIdx === lIdx && completion.matches.length" class="completion-list">
                  <div
                    v-for="(c, ci) in completion.matches"
                    :key="c"
                    class="completion-item"
                    :class="{ active: completion.active === ci }"
                    @mousedown.prevent="applyCompletion(ci)"
                  >{{ c }}</div>
                </div>
              </div>
              <div class="result-block" :class="{ error: line.result === '错误', partial: line.partial, empty: !line.expr.trim() && !line.result }">
                <span class="eq-mark">=</span>
                <span class="result-value" :title="line.errorMsg || line.result">{{ line.result === '错误' ? (line.errorMsg || '错误') : (line.result ? displayResult(line.result) : '') }}</span>
                <span v-if="line.partial" class="partial-hint" :title="line.errorMsg">表达式不完整</span>
                <span v-else-if="line.result === '错误'" class="partial-hint" :title="line.errorMsg">公式错误</span>
              </div>
            </div>

            <div class="row-note">
              <input
                :ref="(el) => setNoteRef(el, lIdx)"
                v-model="line.note"
                class="note-input"
                placeholder="备注（Tab 可回切算式）"
                @keydown.tab.prevent="focusExpr(lIdx)"
                @focus="focusedLine = lIdx"
                @blur="onNoteBlur(lIdx)"
              />
            </div>

            <div class="row-meta">
              <span class="line-time" v-if="line.time">{{ line.time }}</span>
              <div class="row-actions">
                <button class="row-icon" @click="openCopyMenu(lIdx, $event)" title="复制（结果/算式/整行）">⧉</button>
                <button class="row-icon" @click="delLine(lIdx)" title="删除此行（Ctrl+Z 可撤销）">×</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部新增输入区 -->
      <div class="bottom-input">
        <div class="input-row">
          <textarea
            ref="bottomInput"
            v-model="quickExpr"
            @keydown.enter.prevent="addFromBottom"
            @keydown.up.prevent="historyUp"
            class="quick-input"
            rows="1"
            placeholder="计算公式（支持粘贴多行，↑ 调历史）"
            spellcheck="false"
          ></textarea>
          <button class="quick-btn" @click="addFromBottom" title="新增一行">=</button>
        </div>
      </div>

      <!-- 底部工具栏 -->
      <footer class="card-footer">
        <div class="footer-tools">
          <div class="tool-group">
            <button class="tool-btn" @click="clearSheet" title="清空当前稿纸">
              <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
            <button class="tool-btn" @click="clearAllSheets" title="清空所有稿纸">
              <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
            <button class="tool-btn rate-btn" @click="fetchRateToInput" :disabled="rateLoading" title="获取 USD→CNY 实时汇率并填入公式">{{ rateLoading ? '…' : '汇' }}</button>
          </div>
          <div class="tool-group">
            <button class="tool-btn" @click="startRename(activeSheetIndex)" title="重命名稿纸">
              <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button class="tool-btn" @click="undo" title="撤销（Ctrl+Z）">
              <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
            <button class="tool-btn" @click="helpOpen = true" title="帮助">
              <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
          </div>
        </div>

        <button class="btn-new-sheet" @click="addSheet">
          <span class="plus">+</span>
          <span>新稿纸</span>
        </button>
      </footer>
    </div>

    <!-- 行复制菜单（带内容预览） -->
    <div v-if="copyMenu" class="popover copy-menu" :style="menuPos">
      <button class="pop-item" @click="copyRowAction('result')">
        <span class="pop-label">复制结果</span>
        <span class="pop-preview">{{ copyMenu.preview.result }}</span>
      </button>
      <button class="pop-item" @click="copyRowAction('expr')">
        <span class="pop-label">复制算式</span>
        <span class="pop-preview">{{ copyMenu.preview.expr }}</span>
      </button>
      <button class="pop-item" @click="copyRowAction('line')">
        <span class="pop-label">复制整行</span>
        <span class="pop-preview">{{ copyMenu.preview.line }}</span>
      </button>
    </div>

    <!-- 菜单遮罩 -->
    <div v-if="copyMenu" class="popover-mask" @click="closeMenus"></div>

    <!-- 自定义确认弹层 -->
    <transition name="fade">
      <div v-if="confirmState.show" class="modal-mask" @click.self="confirmCancel">
        <div class="modal-card">
          <p class="modal-msg">{{ confirmState.message }}</p>
          <div class="modal-actions">
            <button class="modal-btn" @click="confirmCancel">取消</button>
            <button class="modal-btn primary" @click="confirmOk">确定</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 帮助弹层 -->
    <transition name="fade">
      <div v-if="helpOpen" class="modal-mask" @click.self="helpOpen = false">
        <div class="modal-card help-card">
          <p class="modal-title">帮助与用法</p>
          <div class="help-scroll">
            <!-- 快速上手 -->
            <div class="help-section">
              <div class="help-head">① 快速上手</div>
              <ol class="help-steps">
                <li>在底部输入框输入算式，如 <code>55+888+999</code>，按回车 → 右侧立即显示 <code>= 1,942</code></li>
                <li>点任意历史行可直接修改，改完实时重算；每行下方有备注框写说明</li>
                <li>粘贴多行算式会自动拆分成多行；算式有错会给出具体原因（如「未定义符号：foo」）</li>
              </ol>
            </div>

            <!-- 支持的运算 -->
            <div class="help-section">
              <div class="help-head">② 支持的运算</div>
              <table class="help-table">
                <tr><td><code>+ - * /</code></td><td>加减乘除</td><td>100-20*3 = 40</td></tr>
                <tr><td><code>^</code></td><td>幂运算</td><td>2^10 = 1024</td></tr>
                <tr><td><code>( )</code></td><td>括号，控制优先级</td><td>(100-20)*0.15 = 12</td></tr>
                <tr><td><code>%</code></td><td>取模（余数）</td><td>10%3 = 1</td></tr>
                <tr><td><code>pi</code> <code>e</code></td><td>数学常量</td><td>pi = 3.1415926…</td></tr>
                <tr><td><code>=</code></td><td>定义变量</td><td>tax = 0.13</td></tr>
              </table>
            </div>

            <!-- 常用函数 -->
            <div class="help-section">
              <div class="help-head">③ 常用函数</div>
              <table class="help-table">
                <tr><td><code>sqrt(x)</code></td><td>平方根</td><td>sqrt(9) = 3</td></tr>
                <tr><td><code>abs(x)</code></td><td>绝对值</td><td>abs(-5) = 5</td></tr>
                <tr><td><code>round(x)</code></td><td>四舍五入</td><td>round(3.7) = 4</td></tr>
                <tr><td><code>floor(x)</code> / <code>ceil(x)</code></td><td>向下 / 向上取整</td><td>floor(3.7)=3 · ceil(3.2)=4</td></tr>
                <tr><td><code>min(a,b,…)</code> / <code>max(a,b,…)</code></td><td>最小 / 最大值</td><td>max(3,7,9) = 9</td></tr>
                <tr><td><code>sum(a,b,…)</code></td><td>求和</td><td>sum(1,2,3,4) = 10</td></tr>
                <tr><td><code>sin(x)</code> <code>cos(x)</code> <code>tan(x)</code></td><td>三角函数（弧度）</td><td>sin(pi/2) = 1</td></tr>
                <tr><td><code>exp(x)</code></td><td>e 的 x 次方</td><td>exp(1) = 2.718…</td></tr>
                <tr><td><code>log(x)</code> / <code>log10(x)</code></td><td>自然对数 / 常用对数</td><td>log10(1000) = 3</td></tr>
                <tr><td><code>n!</code></td><td>阶乘</td><td>5! = 120</td></tr>
              </table>
              <p class="help-tip">输入函数名时会出现补全提示，如输入 <code>sq</code> 自动推荐 <code>sqrt(</code>。</p>
            </div>

            <!-- 变量 -->
            <div class="help-section">
              <div class="help-head">④ 变量</div>
              <div class="help-grid">
                第 1 行定义 <code>tax=0.13</code>，第 2 行直接用 <code>1000*tax</code> → 130。<br />
                每张稿纸的变量互相独立；删除定义变量的行，后续引用会自动失效。<br />
                <strong>查看变量值：</strong>输入变量名（如 <code>tax</code>）回车，右侧即显示当前值。
              </div>
            </div>

            <!-- 快捷键 -->
            <div class="help-section">
              <div class="help-head">⑤ 快捷键与操作</div>
              <table class="help-table">
                <tr><td><code>回车</code></td><td>跳下一行（最后一行跳到底部输入框）</td></tr>
                <tr><td><code>Tab</code></td><td>算式 ⇄ 备注 切换</td></tr>
                <tr><td><code>↑</code> / <code>↓</code></td><td>上 / 下移动一行</td></tr>
                <tr><td><code>↑</code>（底部输入框）</td><td>调出最近一条算过的式子</td></tr>
                <tr><td><code>Ctrl+Z</code></td><td>撤销删除 / 清空（最多 50 步）</td></tr>
                <tr><td>拖动 <code>⋮⋮</code></td><td>调整算式行的顺序</td></tr>
                <tr><td>标签 ✎ / 双击标签</td><td>重命名稿纸（回车确认，Esc 取消）</td></tr>
              </table>
            </div>

            <!-- 数据 -->
            <div class="help-section">
              <div class="help-head">⑥ 数据安全</div>
              <div class="help-grid">
                所有数据自动保存在本机浏览器，关闭页面不丢失。
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="modal-btn primary" @click="helpOpen = false">知道了</button>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
// mathjs 按需引入
import {
  create,
  evaluateDependencies,    // 表达式解析/求值
  formatDependencies,      // 结果格式化
  bignumberDependencies,   // 高精度数字
  addDependencies, subtractDependencies, multiplyDependencies, divideDependencies,
  unaryMinusDependencies, unaryPlusDependencies,
  powDependencies, sqrtDependencies, modDependencies,
  equalDependencies, unequalDependencies, smallerDependencies, largerDependencies,
  smallerEqDependencies, largerEqDependencies,
  andDependencies, orDependencies, notDependencies,
  piDependencies, eDependencies,
  sinDependencies, cosDependencies, tanDependencies,
  absDependencies, roundDependencies, floorDependencies, ceilDependencies,
  expDependencies, logDependencies, log10Dependencies, factorialDependencies,
  numberDependencies, booleanDependencies, stringDependencies,
  isIntegerDependencies, isNumericDependencies,
  minDependencies, maxDependencies, sumDependencies
} from 'mathjs'

const math = create(
  {
    evaluateDependencies,
    formatDependencies,
    bignumberDependencies,
    addDependencies, subtractDependencies, multiplyDependencies, divideDependencies, unaryMinusDependencies, unaryPlusDependencies,
    powDependencies, sqrtDependencies, modDependencies,
    equalDependencies, unequalDependencies, smallerDependencies, largerDependencies,
    smallerEqDependencies, largerEqDependencies,
    andDependencies, orDependencies, notDependencies,
    piDependencies, eDependencies,
    sinDependencies, cosDependencies, tanDependencies,
    absDependencies, roundDependencies, floorDependencies, ceilDependencies,
    expDependencies, logDependencies, log10Dependencies, factorialDependencies,
    numberDependencies, booleanDependencies, stringDependencies,
    isIntegerDependencies, isNumericDependencies,
    minDependencies, maxDependencies, sumDependencies
  },
  { number: 'BigNumber' }
)

let uidSeq = 0
function uid() {
  uidSeq += 1
  return `${Date.now().toString(36)}-${uidSeq}-${Math.random().toString(36).slice(2, 7)}`
}

// ---------- 数据 ----------
const sheets = ref([
  { id: uid(), name: '稿纸1', vars: {}, lines: [{ id: uid(), expr: '', result: '', note: '', time: '', errorMsg: '', partial: false }] }
])
const activeSheetIndex = ref(0)
const theme = ref('light')
const currentSheet = computed(() => sheets.value[activeSheetIndex.value])
const isSheetEmpty = computed(() => !currentSheet.value.lines.some(l => l.expr.trim()))

const editingIndex = ref(-1)
const editingName = ref('')
const renameInputs = []
function setRenameInput(el, idx) { if (el) renameInputs[idx] = el }
const toastMsg = ref('')
const focusedLine = ref(-1)
const quickExpr = ref('')
const bottomInput = ref(null)
const paperBody = ref(null)
let toastTimer = null
let saveTimer = null

// 引导
const guideOpen = ref(true)
function dismissGuide() {
  guideOpen.value = false
  try { localStorage.setItem('calc_paper_guide_dismissed', '1') } catch (e) {}
}
function loadExample() {
  pushUndo()
  currentSheet.value.lines = [
    { id: uid(), expr: '55+888+999', result: '', note: '订单金额', time: '', errorMsg: '', partial: false },
    { id: uid(), expr: '1942*0.85', result: '', note: '85折后', time: '', errorMsg: '', partial: false },
    { id: uid(), expr: 'tax=0.13', result: '', note: '税率变量', time: '', errorMsg: '', partial: false },
    { id: uid(), expr: '1650*tax', result: '', note: '含税额', time: '', errorMsg: '', partial: false },
    { id: uid(), expr: 'min(1650, 1942)', result: '', note: '聚合函数', time: '', errorMsg: '', partial: false }
  ]
  rebuildSheetScope(currentSheet.value)
  dismissGuide()
  toast('已载入示例')
}

// 帮助
const helpOpen = ref(false)

// 撤销栈
const undoStack = ref([])
const MAX_UNDO = 50
function pushUndo() {
  try {
    undoStack.value.push(JSON.stringify({ sheets: sheets.value, activeSheetIndex: activeSheetIndex.value }))
    if (undoStack.value.length > MAX_UNDO) undoStack.value.shift()
  } catch (e) {}
}
function undo() {
  if (!undoStack.value.length) { toast('没有可撤销的操作'); return }
  const snap = JSON.parse(undoStack.value.pop())
  sheets.value = snap.sheets
  activeSheetIndex.value = snap.activeSheetIndex
  focusedLine.value = -1
  rebuildScope()
  toast('已撤销')
}

// ---------- 自定义确认 ----------
const confirmState = ref({ show: false, message: '', resolve: null })
function askConfirm(message) {
  return new Promise(resolve => { confirmState.value = { show: true, message, resolve } })
}
function confirmOk() {
  const r = confirmState.value.resolve
  confirmState.value = { show: false, message: '', resolve: null }
  if (r) r(true)
}
function confirmCancel() {
  const r = confirmState.value.resolve
  confirmState.value = { show: false, message: '', resolve: null }
  if (r) r(false)
}

function toast(msg) {
  toastMsg.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 1800)
}

// ---------- 计算与格式化 ----------
// 去掉数字字符串尾部的无效 0（含科学计数法小数部分）
function trimZeros(s) {
  if (s.includes('e')) {
    const [m, exp] = s.split('e')
    return m.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') + 'e' + exp
  }
  return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

function formatResult(res) {
  if (res === undefined || res === null) return ''
  try {
    if (math.isBigNumber(res)) {
      // 整数：完整输出（不转科学计数法，不丢位）
      if (res.isInteger()) return res.toFixed(0)
      // 完整十进制（decimal.js 64 位有效数字，有限小数可精确表示）
      const full = res.toString()
      // 有限且长度适中 → 完整显示，零偏差
      if (!full.includes('e') && full.length <= 32) return trimZeros(full)
      // 无限小数 / 超长：fixed 16 位小数（数学上必然截断，商业精度远超需求）
      const f = trimZeros(math.format(res, { notation: 'fixed', precision: 16 }))
      // fixed 变成 0（极小值）时保留指数形式，避免误显示为 0
      if (f === '0' || f === '-0') return full
      return f
    }
    return math.format(res, { precision: 14 })
  } catch (e) { return String(res) }
}

function displayResult(raw) {
  if (!raw) return ''
  if (raw === '错误') return raw
  if (/^[-+]?\d+(\.\d+)?$/.test(raw)) {
    const [intPart, decPart] = raw.split('.')
    const sign = intPart.startsWith('-') ? '-' : ''
    const digits = intPart.replace(/^-/, '')
    const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return sign + formatted + (decPart !== undefined ? '.' + decPart : '')
  }
  return raw
}

function nowTime() {
  const d = new Date()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function analyzeError(err) {
  const msg = String(err?.message || err || '')
  let m
  m = msg.match(/Undefined symbol (.+)/)
  if (m) return `未定义符号：${m[1]}（检查拼写或是否已定义变量）`
  m = msg.match(/Undefined function (.+)/)
  if (m) return `未定义函数：${m[1]}（检查函数名拼写）`
  m = msg.match(/Too few arguments in function (\w+)/)
  if (m) return `${m[1]}() 缺少参数`
  if (/Too many arguments/.test(msg)) return '参数过多'
  m = msg.match(/Value expected \(char (\d+)\)/)
  if (m) return `运算符后缺少数值（第 ${m[1]} 位）`
  if (/Value expected/.test(msg)) return '运算符后缺少数值'
  if (/Unexpected end of expression/.test(msg)) return '表达式不完整（末尾缺内容）'
  if (/Parenthesis \) expected/.test(msg)) return '缺少右括号 )'
  m = msg.match(/Unexpected operator (.+?) \(/)
  if (m) return `运算符位置错误：${m[1]}`
  m = msg.match(/Unexpected part "(.+?)"/)
  if (m) return `数字格式错误：意外的「${m[1]}」`
  m = msg.match(/Syntax error in part "(.+?)"/)
  if (m) return `无效字符：${m[1]}`
  if (/Invalid left hand side of assignment/.test(msg)) return '赋值错误：等号左侧必须是变量名'
  if (/missing in provided namespace/.test(msg)) return '暂不支持的运算'
  if (/Cannot divide by zero/.test(msg)) return '不能除以零'
  return msg.slice(0, 30) || '无法解析'
}

function safeEval(expr, scope) {
  try { return { ok: true, value: formatResult(math.evaluate(expr, scope)) } }
  catch (e) { return { ok: false, error: e } }
}

function computeLine(line, scope) {
  const trimmed = line.expr.trim()
  if (!trimmed) { line.result = ''; line.partial = false; line.errorMsg = ''; return }
  const full = safeEval(trimmed, scope)
  if (full.ok) {
    line.result = full.value
    line.partial = false
    line.errorMsg = ''
    if (!line.time) line.time = nowTime()
    return
  }
  const open = (trimmed.match(/\(/g) || []).length
  const close = (trimmed.match(/\)/g) || []).length
  const incomplete = /[+\-*/^%]$/.test(trimmed) || /=$/.test(trimmed) || /\.$/.test(trimmed) || open > close
  if (incomplete) {
    const attempt = trimmed.replace(/[+\-*/^%]+$/, '').trim()
    if (attempt && attempt !== trimmed) {
      const p = safeEval(attempt, scope)
      if (p.ok) {
        line.result = p.value
        line.partial = true
        line.errorMsg = '表达式不完整'
        return
      }
    }
    // 无部分值可算：赋值输入中（tax=）不算错；单独符号（+ * ( . 等）按错误处理
    const stripped = trimmed.replace(/=$/, '')
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(stripped)) {
      line.result = ''
      line.partial = false
      line.errorMsg = ''
      return
    }
    line.result = '错误'
    line.partial = false
    line.errorMsg = analyzeError(full.error)
    return
  }
  line.result = '错误'
  line.partial = false
  line.errorMsg = analyzeError(full.error)
}

function rebuildSheetScope(sh) {
  sh.vars = {}
  for (const ln of sh.lines) computeLine(ln, sh.vars)
}
function rebuildScope() {
  for (const sh of sheets.value) rebuildSheetScope(sh)
}

function onExprInput(idx) {
  const sh = currentSheet.value
  if (!sh.vars) sh.vars = {}
  computeLine(sh.lines[idx], sh.vars)
  checkCompletion(idx)
}

// ---------- 焦点 / 行导航 ----------
const exprRefs = []
const noteRefs = []
function setExprRef(el, idx) { if (el) exprRefs[idx] = el }
function setNoteRef(el, idx) { if (el) noteRefs[idx] = el }

function onExprBlur(idx) {
  setTimeout(() => {
    if (noteRefs[idx] && document.activeElement === noteRefs[idx]) return
    if (focusedLine.value === idx) focusedLine.value = -1
  }, 120)
}
function onNoteBlur(idx) {
  setTimeout(() => {
    if (exprRefs[idx] && document.activeElement === exprRefs[idx]) return
    if (focusedLine.value === idx) focusedLine.value = -1
  }, 120)
}
function focusExpr(idx) { nextTick(() => { exprRefs[idx]?.focus() }) }
function focusNote(idx) { nextTick(() => { noteRefs[idx]?.focus() }) }
function focusPrevRow(idx) {
  if (idx > 0) focusExpr(idx - 1)
}
function focusNextRow(idx) {
  const lines = currentSheet.value.lines
  if (idx < lines.length - 1) focusExpr(idx + 1)
  else nextTick(() => bottomInput.value?.focus())
}

// 回车：有补全先补全，否则跳下一行
function onExprEnter(idx) {
  if (completion.value && completion.value.lIdx === idx && completion.value.matches.length) {
    applyCompletion(completion.value.active)
    return
  }
  focusNextRow(idx)
}
// Tab：有补全先补全，否则跳备注
function onExprTab(idx) {
  if (completion.value && completion.value.lIdx === idx && completion.value.matches.length) {
    applyCompletion(completion.value.active)
    return
  }
  focusNote(idx)
}

// ---------- 函数自动补全 ----------
const FUNC_LIST = ['sqrt(', 'abs(', 'round(', 'floor(', 'ceil(', 'min(', 'max(', 'sum(', 'sin(', 'cos(', 'tan(', 'exp(', 'log(', 'log10(', 'factorial(']
const completion = ref(null)
function checkCompletion(idx) {
  const input = exprRefs[idx]
  if (!input) { completion.value = null; return }
  const pos = input.selectionStart
  const before = input.value.slice(0, pos)
  const m = before.match(/([a-zA-Z]{1,})$/)
  if (!m) { completion.value = null; return }
  const word = m[1].toLowerCase()
  const matches = FUNC_LIST.filter(f => f.toLowerCase().startsWith(word))
  if (!matches.length) { completion.value = null; return }
  completion.value = { lIdx: idx, start: pos - word.length, word, matches, active: 0 }
}
function applyCompletion(ci) {
  if (!completion.value) return
  const { lIdx, start, word, matches } = completion.value
  const input = exprRefs[lIdx]
  if (!input) return
  const full = matches[ci] || matches[completion.value.active]
  const next = input.value.slice(0, start) + full + input.value.slice(start + word.length)
  currentSheet.value.lines[lIdx].expr = next
  completion.value = null
  nextTick(() => {
    input.focus()
    const caret = start + full.length
    input.setSelectionRange(caret, caret)
  })
}

// ---------- 行操作 ----------
function delLine(idx) {
  pushUndo()
  if (currentSheet.value.lines.length > 1) {
    currentSheet.value.lines.splice(idx, 1)
  } else {
    currentSheet.value.lines[0] = { id: uid(), expr: '', result: '', note: '', time: '', errorMsg: '', partial: false }
  }
  rebuildSheetScope(currentSheet.value)
}

function addFromBottom() {
  const parts = quickExpr.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  if (!parts.length) { bottomInput.value?.focus(); return }
  const sh = currentSheet.value
  if (!sh.vars) sh.vars = {}
  for (const p of parts) {
    const line = { id: uid(), expr: p, result: '', note: '', time: '', errorMsg: '', partial: false }
    sh.lines.push(line)
    computeLine(line, sh.vars)
  }
  quickExpr.value = ''
  nextTick(() => { bottomInput.value?.focus(); scrollToBottom() })
}

function historyUp() {
  if (quickExpr.value) return
  const lines = currentSheet.value.lines
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].expr.trim()) { quickExpr.value = lines[i].expr; return }
  }
}

function scrollToBottom() {
  nextTick(() => { if (paperBody.value) paperBody.value.scrollTop = paperBody.value.scrollHeight })
}

// ---------- 行拖拽排序 ----------
const dragIndex = ref(-1)
function onDragStart(e, fromIdx) {
  dragIndex.value = fromIdx
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(fromIdx))
}
function onDrop(e, toIdx) {
  const from = Number(e.dataTransfer.getData('text/plain'))
  if (Number.isNaN(from) || from === toIdx) return
  const lines = currentSheet.value.lines
  const [item] = lines.splice(from, 1)
  lines.splice(toIdx, 0, item)
  rebuildSheetScope(currentSheet.value)
  toast('已调整顺序')
}
function onDragEnd() { dragIndex.value = -1 }

// ---------- 菜单（导出 / 备份 / 行复制） ----------
const copyMenu = ref(null) // { lIdx }
const menuPos = ref({})
// 整行的可读文本：算式 = 结果 (备注)
function lineFullText(line) {
  const parts = []
  if (line.expr.trim()) parts.push(line.expr.trim())
  if (line.result) parts.push('= ' + line.result)
  if (line.note.trim()) parts.push(`(${line.note.trim()})`)
  return parts.join(' ') || ''
}

function openCopyMenu(lIdx, e) {
  const line = currentSheet.value.lines[lIdx]
  copyMenu.value = {
    lIdx,
    preview: {
      result: line.result && line.result !== '错误' ? displayResult(line.result) : '（无结果）',
      expr: line.expr.trim() ? line.expr : '（空算式）',
      line: lineFullText(line) || '（空行）'
    }
  }
  const rect = e.currentTarget.getBoundingClientRect()
  menuPos.value = { left: `${Math.min(rect.left, window.innerWidth - 230)}px`, top: `${rect.bottom + 6}px` }
}
function closeMenus() { copyMenu.value = null }
function copyRowAction(type) {
  if (!copyMenu.value) return
  const line = currentSheet.value.lines[copyMenu.value.lIdx]
  const text = type === 'result' ? (line.result || '')
    : type === 'expr' ? line.expr
    : lineFullText(line)
  closeMenus()
  if (!text) { toast('此行暂无内容'); return }
  copyText(text)
}

// ---------- 复制 / 导出 ----------
function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch (e) { return false }
}
async function copyText(text) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast('已复制到剪贴板')
  } catch (e) {
    const ok = legacyCopy(text)
    toast(ok ? '已复制到剪贴板' : '复制失败：剪贴板不可用')
  }
}
function copyLine(line) {
  const v = line.result
  if (!v || v === '错误') { toast('此行暂无结果'); return }
  copyText(v)
}

// ---------- 稿纸操作 ----------
function addSheet() {
  sheets.value.push({ id: uid(), name: `稿纸${sheets.value.length + 1}`, vars: {}, lines: [{ id: uid(), expr: '', result: '', note: '', time: '', errorMsg: '', partial: false }] })
  activeSheetIndex.value = sheets.value.length - 1
}
function switchSheet(idx) {
  activeSheetIndex.value = idx
  focusedLine.value = -1
  closeMenus()
}
function startRename(idx) {
  editingIndex.value = idx
  editingName.value = sheets.value[idx].name
  nextTick(() => {
    const el = renameInputs[idx]
    if (el) { el.focus(); el.select() } // 先 focus 再全选
  })
}
function commitRename() {
  if (editingIndex.value >= 0) {
    const n = editingName.value.trim()
    if (n) sheets.value[editingIndex.value].name = n
    editingIndex.value = -1
  }
}
function cancelRename() {
  editingIndex.value = -1
}
async function delSheet(idx) {
  if (sheets.value.length <= 1) { toast('至少保留一份稿纸'); return }
  const ok = await askConfirm(`确定删除「${sheets.value[idx].name}」？`)
  if (!ok) return
  pushUndo()
  sheets.value.splice(idx, 1)
  if (activeSheetIndex.value === idx) activeSheetIndex.value = Math.min(idx, sheets.value.length - 1)
  else if (activeSheetIndex.value > idx) activeSheetIndex.value--
}
async function clearSheet() {
  if (isSheetEmpty.value) return
  const ok = await askConfirm(`清空「${currentSheet.value.name}」的所有算式？`)
  if (!ok) return
  pushUndo()
  currentSheet.value.lines = [{ id: uid(), expr: '', result: '', note: '', time: '', errorMsg: '', partial: false }]
  currentSheet.value.vars = {}
}
async function clearAllSheets() {
  const ok = await askConfirm('确定清空所有稿纸？此操作不可恢复。')
  if (!ok) return
  pushUndo()
  sheets.value = [{ id: uid(), name: '稿纸1', vars: {}, lines: [{ id: uid(), expr: '', result: '', note: '', time: '', errorMsg: '', partial: false }] }]
  activeSheetIndex.value = 0
}

// ---------- 汇率填入公式（独立按钮，不影响其他功能） ----------
const rateLoading = ref(false)
async function fetchRateToInput() {
  rateLoading.value = true
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error('fail')
    const data = await res.json()
    const cny = data.rates?.CNY
    if (!cny) throw new Error('no cny')
    const val = Number(cny).toFixed(6)
    // 填入底部公式框：空则直接填；末尾是运算符则追加；否则补 * 再追加
    if (quickExpr.value.trim()) {
      const t = quickExpr.value.trimEnd()
      quickExpr.value = /[+\-*/^%]$/.test(t) ? t + val : t + '*' + val
    } else {
      quickExpr.value = val
    }
    toast(`USD→CNY ${val} 已填入`)
    // 填入后光标回到公式框末尾，方便继续输入
    nextTick(() => {
      const el = bottomInput.value
      if (el) {
        el.focus()
        const len = el.value.length
        el.setSelectionRange(len, len)
      }
    })
  } catch (e) {
    toast('获取汇率失败，请检查网络')
  } finally {
    rateLoading.value = false
  }
}

// ---------- 主题 ----------
function toggleTheme() { theme.value = theme.value === 'light' ? 'dark' : 'light' }

// ---------- 全局快捷键 ----------
function onGlobalKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    e.preventDefault()
    undo()
  }
}

// ---------- 持久化 ----------
async function saveState() {
  const data = { sheets: sheets.value, activeSheetIndex: activeSheetIndex.value, theme: theme.value }
  try { localStorage.setItem('calc_paper_state', JSON.stringify(data)) } catch (e) {}
}
async function loadState() {
  try {
    const raw = localStorage.getItem('calc_paper_state')
    if (raw) return JSON.parse(raw)
  } catch (e) {}
  return null
}
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveState() }, 400)
}
watch([sheets, activeSheetIndex, theme], scheduleSave, { deep: true })

// ---------- 启动 ----------
onMounted(async () => {
  const saved = await loadState()
  if (saved) {
    if (Array.isArray(saved.sheets) && saved.sheets.length) {
      sheets.value = saved.sheets.map(sh => ({
        id: sh.id || uid(),
        name: sh.name || '稿纸',
        vars: {},
        lines: (sh.lines || []).map(l => ({
          id: l.id || uid(),
          expr: l.expr || '',
          result: l.result || '',
          note: l.note || '',
          time: l.time || (l.result ? nowTime() : ''),
          errorMsg: l.errorMsg || '',
          partial: !!l.partial
        }))
      }))
    }
    if (typeof saved.activeSheetIndex === 'number') activeSheetIndex.value = saved.activeSheetIndex
    if (saved.theme === 'dark' || saved.theme === 'light') theme.value = saved.theme
  }
  try { guideOpen.value = !localStorage.getItem('calc_paper_guide_dismissed') } catch (e) {}
  rebuildScope()
  window.addEventListener('keydown', onGlobalKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<style>
:root {
  --bg: #f5f5f7;
  --card: #ffffff;
  --card-shadow: 0 18px 50px rgba(0, 0, 0, 0.08);
  --text: #1d1d1f;
  --muted: #86868b;
  --border: rgba(0, 0, 0, 0.08);
  --accent: #0071e3;
  --accent-hover: #0077ed;
  --result: #1d1d1f;
  --error: #ff3b30;
  --row-bg: #ffffff;
  --row-hover: #f5f5f7;
  --tab-bg: #e8e8ed;
  --tab-active-bg: #ffffff;
  --input-bg: #f5f5f7;
  --tool-bg: rgba(0, 0, 0, 0.04);
  --footer-bg: rgba(250, 250, 252, 0.8);
  --focus-bg: rgba(0, 113, 227, 0.06);
  --focus-ring: rgba(0, 113, 227, 0.12);
}
[data-theme="dark"] {
  --bg: #16181d;
  --card: #1e2128;
  --card-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  --text: #f5f5f7;
  --muted: #9aa0a6;
  --border: rgba(255, 255, 255, 0.1);
  --accent: #0a84ff;
  --accent-hover: #409cff;
  --result: #f5f5f7;
  --error: #ff453a;
  --row-bg: #1e2128;
  --row-hover: #2a2e36;
  --tab-bg: #2c313b;
  --tab-active-bg: #3a3f48;
  --input-bg: #2a2e36;
  --tool-bg: rgba(255, 255, 255, 0.06);
  --footer-bg: rgba(30, 33, 40, 0.85);
  --focus-bg: rgba(10, 132, 255, 0.14);
  --focus-ring: rgba(10, 132, 255, 0.22);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Microsoft YaHei", sans-serif;
  background: var(--bg); color: var(--text);
  -webkit-font-smoothing: antialiased;
}
.app-wrapper {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  background: var(--bg);
}
.app-card {
  width: 100%; max-width: 920px; max-height: 90vh;
  background: var(--card);
  border-radius: 24px;
  box-shadow: var(--card-shadow);
  display: flex; flex-direction: column;
  overflow: hidden;
}

/* 标题栏 */
.card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(10px);
}
[data-theme="dark"] .card-header { background: rgba(30, 33, 40, 0.7); }
.title-tab {
  display: flex; align-items: center; gap: 10px;
  background: var(--tab-bg);
  padding: 6px 10px 6px 8px;
  border-radius: 10px;
  border: 1px solid var(--border);
}
.tab-icon { width: 22px; height: 22px; color: #ff9500; display: flex; align-items: center; justify-content: center; }
.tab-icon svg { width: 100%; height: 100%; }
.tab-title { font-size: 14px; font-weight: 600; }
.header-actions { display: flex; gap: 8px; }
.icon-btn {
  width: 32px; height: 32px; border: none; border-radius: 50%;
  background: var(--tool-bg); color: var(--text); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.icon-btn:hover { background: var(--tab-bg); }
.i-20 { width: 20px; height: 20px; }

/* 稿纸标签 */
.sheet-bar { padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--card); }
.sheet-tabs { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
.sheet-tabs::-webkit-scrollbar { display: none; }
.sheet-tab {
  display: flex; align-items: center; gap: 6px; padding: 5px 12px;
  border-radius: 100px; background: var(--tab-bg); border: 1px solid transparent;
  cursor: pointer; font-size: 13px; white-space: nowrap;
  transition: background .15s, border-color .15s;
}
.sheet-tab.active { background: var(--tab-active-bg); border-color: var(--border); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); }
.sheet-name { max-width: 130px; overflow: hidden; text-overflow: ellipsis; }
.rename-input { width: 110px; border: none; background: transparent; color: inherit; font-size: 13px; outline: none; padding: 0; }
/* 重命名铅笔图标：hover 显示 */
.sheet-edit {
  width: 15px; height: 15px; border-radius: 50%;
  display: none; align-items: center; justify-content: center;
  opacity: 0.55; font-size: 10px; cursor: pointer; flex: 0 0 auto;
}
.sheet-tab:hover .sheet-edit { display: flex; }
.sheet-edit:hover { opacity: 1; color: var(--accent); background: rgba(0, 113, 227, 0.12); }
.sheet-tab.editing { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus-ring); }
.sheet-del {
  width: 16px; height: 16px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  opacity: 0.55; font-size: 13px; font-weight: 700;
}
.sheet-del:hover { opacity: 1; background: rgba(255, 59, 48, 0.12); color: var(--error); }

/* 演算列表 */


.paper-body { flex: 1; overflow-y: auto; padding: 6px 0; }
.calc-list { padding: 0 16px; }

/* 空状态引导 */
.guide-card {
  margin: 24px 16px;
  padding: 28px 26px;
  border: 1px dashed var(--border);
  border-radius: 16px;
  background: var(--row-hover);
  text-align: center;
}
.guide-title { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
.guide-sub { font-size: 13px; color: var(--muted); margin-bottom: 16px; line-height: 1.6; }
.guide-examples { text-align: left; display: inline-block; font-size: 13px; line-height: 2; color: var(--text); }
.guide-example code {
  background: var(--tab-bg); border-radius: 4px; padding: 1px 6px;
  font-family: "SF Mono", Consolas, monospace; font-size: 12px;
}
.guide-actions { margin-top: 18px; display: flex; gap: 10px; justify-content: center; }

.calc-row {
  position: relative;
  background: var(--row-bg);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 8px;
  border: 1px solid transparent;
  transition: background .15s, border-color .15s, box-shadow .15s, opacity .15s;
}
.calc-row:hover { background: var(--row-hover); }
.calc-row.focused {
  background: var(--focus-bg);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--focus-ring);
}
.calc-row.focused::before {
  content: '';
  position: absolute; left: -1px; top: 50%; transform: translateY(-50%);
  width: 4px; height: 58%; border-radius: 4px; background: var(--accent);
}
.calc-row.dragging { opacity: 0.45; }

.row-main { display: flex; align-items: baseline; gap: 12px; }
.drag-handle {
  cursor: grab; color: var(--muted); opacity: 0.35;
  font-size: 14px; letter-spacing: -2px; user-select: none; align-self: center;
}
.calc-row:hover .drag-handle { opacity: 0.8; }
.drag-handle:active { cursor: grabbing; }

.expr-wrap { position: relative; flex: 1; min-width: 0; }
.expr-input {
  width: 100%;
  border: none; background: transparent;
  font-size: 21px; font-weight: 600; color: var(--text);
  padding: 4px 0; outline: none;
  font-family: "SF Mono", SFMono-Regular, Consolas, monospace;
}
.expr-input::placeholder { color: var(--muted); opacity: 0.7; }

/* 函数补全下拉 */
.completion-list {
  position: absolute; top: 100%; left: 0; z-index: 50;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  max-height: 200px; overflow-y: auto;
  min-width: 140px;
}
.completion-item {
  padding: 6px 12px; font-size: 13px; cursor: pointer;
  font-family: "SF Mono", Consolas, monospace;
}
.completion-item:hover, .completion-item.active { background: var(--focus-bg); color: var(--accent); }

.result-block {
  flex: 0 0 auto; max-width: 55%;
  display: flex; align-items: baseline; gap: 6px;
  font-family: "SF Mono", SFMono-Regular, Consolas, monospace;
  color: var(--result);
  white-space: nowrap; overflow: hidden;
}
.result-block.empty { opacity: 0; }
.result-block.partial,
.result-block.error {
  background: rgba(255, 59, 48, 0.08);
  border: 1px solid rgba(255, 59, 48, 0.35);
  border-radius: 8px;
  padding: 2px 8px;
  min-width: 108px;
  justify-content: center;
}
.result-block.error { max-width: 90%; justify-content: flex-start; }
.result-block.partial .result-value {
  color: var(--error); font-size: 18px; font-weight: 700;
}
.result-block.error .result-value {
  color: var(--error); font-size: 13px; font-weight: 600;
  white-space: normal; line-height: 1.4; text-align: left;
  overflow: visible; text-overflow: clip;
}
.partial-hint {
  font-size: 10px; color: #fff; background: var(--error);
  padding: 1px 6px; border-radius: 4px; font-weight: 600;
  letter-spacing: 0.5px; align-self: center; flex: 0 0 auto;
}
.eq-mark { color: var(--muted); font-size: 20px; font-weight: 400; }
.result-value {
  font-size: 26px; font-weight: 700;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.row-note { margin-top: 6px; }
.note-input {
  width: 100%;
  border: none; border-bottom: 1px solid var(--border);
  background: transparent;
  font-size: 12px; color: var(--muted);
  opacity: 0.85; padding: 3px 0 4px; outline: none;
}
.note-input::placeholder { color: var(--muted); opacity: 0.55; }
.note-input:focus { border-bottom-color: var(--accent); color: var(--text); opacity: 1; }

.row-meta {
  margin-top: 10px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px;
}
.line-time { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.row-actions { display: flex; gap: 6px; opacity: 0; transition: opacity .12s; }
.calc-row:hover .row-actions { opacity: 1; }
.calc-row.focused .row-actions { opacity: 1; }
@media (hover: none) { .row-actions { opacity: 1; } }
.row-icon {
  width: 26px; height: 26px; border-radius: 6px;
  border: none; background: var(--tool-bg); color: var(--muted);
  cursor: pointer; font-size: 14px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
.row-icon:hover { color: var(--accent); background: var(--tab-bg); }

/* 底部输入 */
.bottom-input {
  padding: 8px 16px 12px;
  border-top: 1px solid var(--border);
  background: var(--input-bg);
}
.input-row { display: flex; align-items: center; gap: 10px; }
.quick-input {
  flex: 1;
  border: none; background: transparent;
  font-size: 21px; font-weight: 600; color: var(--text);
  padding: 8px 0; outline: none;
  font-family: "SF Mono", SFMono-Regular, Consolas, monospace;
  resize: none; overflow-y: auto;
  max-height: 96px; line-height: 1.5;
}
.quick-input::placeholder { color: var(--muted); opacity: 0.7; }
.quick-btn {
  width: 40px; height: 40px; border-radius: 10px;
  border: none; background: var(--accent); color: #fff;
  font-size: 22px; font-weight: 500; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 113, 227, 0.25);
  flex: 0 0 auto;
}
.quick-btn:hover { background: var(--accent-hover); }
.quick-btn:active { transform: translateY(1px); }
.rate-btn { font-size: 15px; line-height: 1; font-weight: 600; }
.rate-btn:disabled { opacity: 0.5; cursor: wait; }

/* 底部工具栏 */
.card-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  background: var(--footer-bg);
  backdrop-filter: blur(10px);
}
.footer-tools { display: flex; gap: 12px; align-items: center; }
.tool-group { display: flex; gap: 8px; }
.tool-btn {
  width: 34px; height: 34px; border-radius: 10px;
  border: none; background: var(--tool-bg); color: var(--text);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.tool-btn:hover { background: var(--tab-bg); }
.i-18 { width: 18px; height: 18px; }

.btn-new-sheet {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px;
  border: 1px solid var(--border); border-radius: 100px;
  background: var(--card); color: var(--text);
  font-size: 13px; font-weight: 500; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.btn-new-sheet:hover { border-color: var(--accent); color: var(--accent); }
.btn-new-sheet .plus { font-size: 16px; line-height: 1; }

/* 弹层菜单 */
.popover-mask { position: fixed; inset: 0; z-index: 80; }
.popover {
  position: fixed; z-index: 90;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.14);
  padding: 6px;
  min-width: 150px;
  display: flex; flex-direction: column;
}
.pop-item {
  border: none; background: transparent; color: var(--text);
  text-align: left; padding: 8px 12px; border-radius: 8px;
  font-size: 13px; cursor: pointer;
}
.pop-item:hover { background: var(--focus-bg); color: var(--accent); }
/* 行复制菜单：标签 + 内容预览 */
.copy-menu { min-width: 230px; }
.copy-menu .pop-item {
  display: flex; flex-direction: column; gap: 2px;
  padding: 7px 12px;
}
.pop-label { font-weight: 600; }
.pop-preview {
  font-size: 11px; color: var(--muted);
  font-family: "SF Mono", Consolas, monospace;
  max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.copy-menu .pop-item:hover .pop-preview { color: var(--muted); }

/* 自定义确认弹层 */
.modal-mask {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
}
.modal-card {
  background: var(--card);
  border-radius: 18px;
  padding: 24px 22px 18px;
  width: min(340px, 86vw);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}
.modal-msg { font-size: 15px; color: var(--text); line-height: 1.5; margin-bottom: 20px; word-break: break-all; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
.modal-btn {
  border: 1px solid var(--border);
  background: var(--tool-bg); color: var(--text);
  padding: 7px 18px; border-radius: 100px;
  font-size: 14px; cursor: pointer;
}
.modal-btn:hover { background: var(--tab-bg); }
.modal-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.modal-btn.primary:hover { background: var(--accent-hover); }

/* 帮助弹层 */
.help-card { width: min(520px, 92vw); }
.help-scroll { max-height: 58vh; overflow-y: auto; padding-right: 4px; }
.help-scroll::-webkit-scrollbar { width: 6px; }
.help-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
.help-steps { padding-left: 18px; font-size: 13px; line-height: 2; color: var(--text); }
.help-steps code { background: var(--tab-bg); border-radius: 4px; padding: 1px 6px; font-family: "SF Mono", Consolas, monospace; font-size: 12px; }
.help-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.help-table td { padding: 4px 8px 4px 0; border-bottom: 1px solid var(--border); line-height: 1.6; vertical-align: top; }
.help-table td:first-child { white-space: nowrap; width: 34%; }
.help-table td:last-child { color: var(--muted); }
.help-table code { background: var(--tab-bg); border-radius: 4px; padding: 1px 5px; font-family: "SF Mono", Consolas, monospace; font-size: 12px; }
.help-tip { font-size: 12px; color: var(--muted); margin-top: 8px; }
.modal-title { font-size: 17px; font-weight: 700; margin-bottom: 16px; }
.help-section { margin-bottom: 14px; }
.help-head { font-size: 13px; font-weight: 600; color: var(--muted); margin-bottom: 6px; }
.help-grid { font-size: 13px; line-height: 2; color: var(--text); }
.help-grid code {
  background: var(--tab-bg); border-radius: 4px; padding: 1px 6px;
  font-family: "SF Mono", Consolas, monospace; font-size: 12px;
}

/* Toast */
.toast {
  position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.82); color: #fff;
  padding: 9px 18px; border-radius: 100px;
  font-size: 13px; z-index: 99; backdrop-filter: blur(8px);
}
.fade-enter-active, .fade-leave-active { transition: opacity .25s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* 响应式 */
@media (max-width: 640px) {
  .app-wrapper { padding: 12px; }
  .app-card { max-height: 95vh; border-radius: 18px; }
  .result-value { font-size: 20px; }
  .expr-input, .quick-input { font-size: 18px; }
  .row-main { flex-direction: column; align-items: flex-start; gap: 6px; }
  .result-block { max-width: 100%; }
}
</style>
