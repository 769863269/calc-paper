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
          <span class="version-tag">v{{ APP_VERSION }} · {{ APP_AUTHOR }}</span>
          <!-- 写盘失败时常驻显示，点一下直接导出备份（备份不走 localStorage） -->
          <button v-if="saveFailed" class="save-warn" @click="exportBackup" v-tip="'数据没能保存到本机，点击导出备份'">
            <span class="save-warn-dot"></span>未保存
          </button>
        </div>

        <div class="header-actions">
          <div class="precision-control" v-tip="'结果保留小数位数'">
            <input
              type="number"
              min="0"
              max="12"
              class="precision-input"
              :value="decimalPlaces"
              @focus="onPrecisionFocus"
              @change="onPrecisionChange"
              @keyup.enter="onPrecisionEnter"
            />
            <span class="precision-unit">位</span>
          </div>
          <button class="icon-btn" @click="toggleTheme" v-tip="() => theme === 'light' ? '切换暗色' : '切换亮色'">
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
        <div class="sheet-tabs" ref="sheetTabs">
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
            <span v-if="editingIndex !== sIdx" class="sheet-edit" v-tip="'重命名（双击标签也可）'" @click.stop="startRename(sIdx)">✎</span>
            <span v-if="sheets.length > 1 && editingIndex !== sIdx" class="sheet-del" v-tip="'删除此稿纸'" @click.stop="delSheet(sIdx)">×</span>
          </div>
        </div>
        <button class="sheet-add" @click="addSheet" v-tip="'新建稿纸'" aria-label="新建稿纸">
          <svg class="i-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <!-- 演算列表 -->
      <div class="paper-wrap">
      <div class="paper-body" :class="'paper-' + paperStyle" ref="paperBody" @scroll.passive="touchScrollMemory">
        <!-- 超长稿纸提示：>500 行才出现，纯提示不拦操作 -->
        <div v-if="showSplitHint" class="split-hint" role="status">
          <span class="split-hint-text">
            这张稿纸已有 <b>{{ currentSheet.lines.length }}</b> 行，超过 {{ HUGE_SHEET_ROWS }} 行后首屏与滚动会明显变慢，建议拆成多张稿纸
          </span>
          <span class="split-hint-actions">
            <button class="modal-btn primary split-hint-btn" @click="splitHugeSheet">新建稿纸</button>
            <button class="modal-btn split-hint-btn" @click="dismissSplitHint">不再提示</button>
          </span>
        </div>
        <!-- 空状态引导 -->
        <div v-if="guideOpen && isSheetEmpty" class="guide-card">
          <div class="guide-title">欢迎使用计算稿纸 👋</div>
          <p class="guide-sub">多行算式实时计算，回车跳下一行；支持变量、备注、多稿纸，数据自动保存在本机。</p>
          <div class="guide-examples">
            <div class="guide-example">· 算式：<code>55+888+999</code> → <code>= 1,942</code></div>
            <div class="guide-example">· 变量：<code>tax=0.13</code>，下一行用 <code>1000*tax</code></div>
            <div class="guide-example">· 快捷键：<code>Ctrl+Z</code> 撤销 · <code>Ctrl+Y</code> 重做 · <code>Tab</code> 算式⇄备注 · 底部 <code>↑</code> 上一结果 → 上一公式 → 选行</div>
          </div>
          <div class="guide-actions">
            <button class="modal-btn primary" @click="loadExample">载入示例</button>
            <button class="modal-btn" @click="dismissGuide">开始使用</button>
          </div>
        </div>
        <!-- 空稿纸轻提示（非首次：新增稿纸/清空后不再弹大卡，给个不碍事的入口） -->
        <div v-else-if="isSheetEmpty" class="empty-hint">
          <div class="empty-hint-title">空白稿纸</div>
          <div class="empty-hint-sub">在下方输入算式，回车即可计算；也可以先载入示例看看效果</div>
          <button class="modal-btn primary" @click="loadExample">载入示例</button>
        </div>

        <transition-group name="row" tag="div" class="calc-list" :class="{ dense: isDenseList }" @before-leave="beforeRowLeave">
          <div
            v-for="(line, lIdx) in currentSheet.lines"
            :key="line.id"
            class="calc-row"
            :class="{ focused: focusedLine === lIdx, latest: latestLineIdx === lIdx, dragging: dragState.from === lIdx, pulse: line.pulse, shake: line.shake, 'drop-above': dragState.to === lIdx && dragState.pos === 'above', 'drop-below': dragState.to === lIdx && dragState.pos === 'below' }"
            :data-id="line.id"
            :data-lIdx="lIdx"
            :ref="(el) => setRowRef(el, line.id)"
            @click="onRowClick(lIdx, $event)"
            @contextmenu.prevent="openRowMenu(lIdx, $event)"
          >
            <div class="row-main">
            <div class="expr-wrap" @mouseenter="onExprHover(lIdx, $event)" @mouseleave="hideVarTip">
                <textarea
                  :ref="(el) => setExprRef(el, lIdx)"
                  v-model="line.expr"
                  @input="onExprInput(lIdx)"
                  @paste="onExprPaste(lIdx, $event)"
                  @keydown.enter="onExprEnter(lIdx, $event)"
                  @keydown.tab="onExprTab(lIdx, $event)"
                  @keydown.up="onExprUp(lIdx, $event)"
                  @keydown.down="onExprDown(lIdx, $event)"
                  @focus="onRowFocus(lIdx)"
                  @blur="onExprBlur(lIdx)"
                  class="expr-input mono-textarea"
                  placeholder="计算公式（回车跳下一行，粘贴多行自动拆分）"
                  spellcheck="false"
                  rows="1"
                ></textarea>
                <!-- 函数自动补全下拉 -->
                <div v-if="completion && completion.lIdx === lIdx && completion.matches.length" class="completion-list">
                  <div
                    v-for="(c, ci) in completion.matches"
                    :key="c.name"
                    class="completion-item"
                    :class="{ active: completion.active === ci }"
                    @mousedown.prevent="applyCompletion(ci)"
                  >
                    <span class="completion-name">{{ c.name }}</span>
                    <span class="completion-desc">{{ c.desc }}</span>
                  </div>
                </div>
              </div>
              <div
                class="result-block"
                :class="{ error: line.result === '错误', partial: line.partial, empty: !line.expr.trim() && !line.result }"
                :aria-live="focusedLine === lIdx ? 'polite' : 'off'"
                aria-atomic="true"
              >
                <span class="eq-mark">=</span>
                <span class="result-value" :ref="(el) => setResultRef(el, lIdx)" @dblclick.stop="copyResultDbl(lIdx)">{{ line.result === '错误' ? (line.errorMsg || '错误') : (line.result ? displayResult(line.result) : '') }}</span>
                <span v-if="line.partial" class="partial-hint" :title="line.errorMsg">表达式不完整</span>
                <span v-else-if="line.result === '错误'" class="partial-hint err-badge" @click="openErrPopover(lIdx, $event)" v-tip="'点击查看原因与建议'">公式错误 ⓘ</span>
              </div>
            </div>

            <div class="row-note">
              <input
                :ref="(el) => setNoteRef(el, lIdx)"
                v-model="line.note"
                class="note-input"
                placeholder="备注（Tab 可回切算式）"
                @keydown.tab="onNoteTab(lIdx, $event)"
                @focus="onRowFocus(lIdx)"
                @blur="onNoteBlur(lIdx)"
              />
            </div>

            <div class="row-meta">
              <div class="row-meta-left">
                <span class="drag-handle" v-tip="'拖动排序（鼠标/触屏均可）'" @pointerdown.stop.prevent="onHandlePointerDown($event, lIdx)">⋮⋮</span>
                <span class="line-time" v-if="line.time">{{ line.time }}</span>
              </div>
              <span v-if="copyFeedbackIdx === lIdx" class="copy-feedback">✓ 已复制</span>
              <div class="row-actions">
                <button class="row-icon" @click="openCopyMenu(lIdx, $event)" v-tip="'复制（结果/算式/整行）'">⧉</button>
                <button class="row-icon" @click="delLine(lIdx)" v-tip="'删除此行（可撤销）'">×</button>
              </div>
            </div>
          </div>
        </transition-group>
      </div>
      </div>

      <!-- 底部新增输入区 -->
      <div class="bottom-input">
        <div class="input-row">
          <textarea
            ref="bottomInput"
            v-model="quickExpr"
            :class="{ 'quick-input': true, 'mono-textarea': true, 'q-focused': bottomFocused }"
            @input="onQuickInput"
            @focus="bottomFocused = true"
            @blur="bottomFocused = false"
            @keydown.enter="addFromBottom($event)"
            @keydown.ctrl.enter="addFromBottom($event)"
            @keydown.up="bottomUp($event)"
            @keydown.esc="bottomEsc($event)"
            rows="1"
            placeholder="计算公式（支持粘贴多行，↑ 上一结果 → 上一公式 → 选行，Ctrl+Enter 执行）"
            spellcheck="false"
          ></textarea>
          <button class="quick-btn" @click="addFromBottom()" v-tip="'新增一行（Enter / Ctrl+Enter）'">=</button>
        </div>
      </div>

      <!-- 底部工具栏 -->
      <footer class="card-footer">
        <div class="footer-tools">
          <div class="tool-group">
            <button class="tool-btn" @click="clearSheet" v-tip="'清空当前稿纸'">
              <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
            <button class="tool-btn" @click="clearAllSheets" v-tip="'清空所有稿纸'">
              <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
            <button class="tool-btn rate-btn" @click="fetchRateToInput" :disabled="rateLoading" v-tip="'获取 USD→CNY 参考汇率'">
              <span v-if="rateLoading" class="spinner"></span>
              <span v-else>汇</span>
            </button>
          </div>

          <div class="tool-group">
            <button class="tool-btn" @click="startRename(activeSheetIndex)" v-tip="'重命名稿纸'">
              <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button class="tool-btn" @click="undo" :disabled="!undoStack.length" v-tip="'撤销（Ctrl+Z）'">
              <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
            <button class="tool-btn" @click="redo" :disabled="!redoStack.length" v-tip="'重做（Ctrl+Y）'">
              <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
              </svg>
            </button>
            <button class="tool-btn" @click="helpOpen = true" v-tip="'帮助'">
              <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
          </div>

          <!-- 新增功能组 -->
          <div class="tool-group tool-group-feat">
            <button class="tool-btn" @click="copyAllResults" v-tip="'复制全部结果'">
              <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>

            <div class="tool-export-wrap">
              <button class="tool-btn" @click="toggleExportMenu" v-tip="'导出 / 备份'">
                <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <transition name="pop">
                <div v-if="exportMenuOpen" class="export-menu">
                  <button class="exp-item" @click="exportMarkdown">
                    <svg class="i-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span>Markdown</span>
                  </button>
                  <button class="exp-item" @click="exportImage">
                    <svg class="i-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <span>图片（PNG）</span>
                  </button>
                  <button class="exp-item" @click="exportPdf">
                    <svg class="i-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                    <span>PDF 稿纸</span>
                  </button>
                  <!-- 上面三种是「给人看」的成品，下面两项是「给自己留后路」的可回灌备份 -->
                  <div class="exp-divider"></div>
                  <button class="exp-item" @click="exportBackup">
                    <svg class="i-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    <span>备份（.json）</span>
                  </button>
                  <button class="exp-item" @click="pickBackup">
                    <svg class="i-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <span>从备份恢复…</span>
                  </button>
                </div>
              </transition>
            </div>

            <button class="tool-btn" :class="{ 'tool-on': varPanelOpen }" @click="varPanelOpen = !varPanelOpen" v-tip="'变量面板'">
              <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 5H7l5 7-5 7h10" stroke-linejoin="round" />
              </svg>
            </button>

            <div class="tool-export-wrap">
              <button class="tool-btn" @click="styleMenuOpen = !styleMenuOpen" :class="{ 'tool-on': styleMenuOpen }" v-tip="'稿纸样式'">
                <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="4" y="4" width="16" height="16" rx="1.5" />
                  <line x1="4" y1="9" x2="20" y2="9" />
                  <line x1="4" y1="14" x2="20" y2="14" />
                </svg>
              </button>
              <transition name="pop">
                <div v-if="styleMenuOpen" class="export-menu style-menu">
                  <button class="exp-item" :class="{ active: paperStyle === 'white' }" @click="setPaperStyle('white')"><span class="sw sw-white"></span>白纸</button>
                  <button class="exp-item" :class="{ active: paperStyle === 'ruled' }" @click="setPaperStyle('ruled')"><span class="sw sw-ruled"></span>横格稿纸</button>
                  <button class="exp-item" :class="{ active: paperStyle === 'grid' }" @click="setPaperStyle('grid')"><span class="sw sw-grid"></span>方格稿纸</button>
                  <button class="exp-item" :class="{ active: paperStyle === 'yellow' }" @click="setPaperStyle('yellow')"><span class="sw sw-yellow"></span>黄色纸</button>
                  <button class="exp-item" :class="{ active: paperStyle === 'green' }" @click="setPaperStyle('green')"><span class="sw sw-green"></span>护眼绿</button>
                </div>
              </transition>
            </div>

            <button class="tool-btn" @click="openChart" v-tip="'简易图表'">
              <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="4" y1="20" x2="20" y2="20" />
                <rect x="6" y="11" width="3" height="9" rx="1" />
                <rect x="11" y="6" width="3" height="14" rx="1" />
                <rect x="16" y="14" width="3" height="6" rx="1" />
              </svg>
            </button>
          </div>
        </div>

        <!-- 备份恢复用的隐藏文件选择器：点菜单项时程序化 click() -->
        <input
          ref="backupInput"
          type="file"
          accept=".json,application/json"
          class="visually-hidden"
          @change="onBackupFile"
        />
        <!-- 导出菜单点击外部关闭遮罩 -->
        <div v-if="exportMenuOpen || styleMenuOpen" class="popover-mask" @click="exportMenuOpen = false; styleMenuOpen = false"></div>

      </footer>

      <!-- 变量面板 -->
      <VarPanel
        :open="varPanelOpen"
        :entries="varEntries"
        :drafts="varDrafts"
        @close="varPanelOpen = false"
        @draft="onVarDraft"
        @commit="onVarCommit"
        @copy="copyVarValue"
        @focus="onVarFocus"
        @blur="onVarBlur"
      />

    </div>

    <!-- 汇率说明卡片 -->
    <RateCard :card="rateCard" :countdown="rateCountdown" @close="closeRateCard" />

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
    <!-- 行右键菜单 -->
    <div v-if="rowMenu.show" class="popover row-menu" :style="rowMenu.pos" @contextmenu.prevent.stop>
      <button class="pop-item" :disabled="rowMenu.lIdx <= 0" @click="rowMenuMove(-1)">
        <span class="pop-label">上移</span>
      </button>
      <button class="pop-item" :disabled="rowMenu.lIdx >= currentSheet.lines.length - 1" @click="rowMenuMove(1)">
        <span class="pop-label">下移</span>
      </button>
      <div class="pop-sep"></div>
      <button class="pop-item" @click="rowMenuInsert(0)"><span class="pop-label">在上方插入空行</span></button>
      <button class="pop-item" @click="rowMenuInsert(1)"><span class="pop-label">在下方插入空行</span></button>
      <div class="pop-sep"></div>
      <button class="pop-item" @click="rowMenuCopy('result')"><span class="pop-label">复制结果</span></button>
      <button class="pop-item" @click="rowMenuCopy('expr')"><span class="pop-label">复制算式</span></button>
      <button class="pop-item" @click="rowMenuCopy('line')"><span class="pop-label">复制整行</span></button>
      <div class="pop-sep"></div>
      <button class="pop-item" @click="rowMenuClear"><span class="pop-label">清空此行</span></button>
      <button class="pop-item danger" @click="rowMenuDelete"><span class="pop-label">删除此行</span></button>
    </div>
    <!-- 行菜单不再用全屏遮罩：遮罩会挡住行，导致第二次右键打到遮罩上弹出浏览器原生菜单。改为全局 contextmenu/mousedown 拦截（见 onWinCtx / onWinMouseDown） -->
    <div v-if="copyMenu" class="popover-mask" @click="closeMenus"></div>

    <!-- 错误详情浮层（点击"公式错误"徽标展开） -->
    <div v-if="errPopover.show" class="popover err-popover" :style="errPopover.pos">
      <div class="err-title">公式错误</div>
      <div class="err-reason">{{ errPopover.reason }}</div>
      <div class="err-suggest" v-if="errPopover.suggest">
        <span class="err-suggest-label">建议</span>{{ errPopover.suggest }}
      </div>
    </div>
    <div v-if="errPopover.show" class="popover-mask" @click="closeErrPopover"></div>

    <!-- 自定义 tooltip（带箭头，延迟 300ms，自动翻转避开视口边缘） -->
    <transition name="fade">
      <div v-if="tipState.show" class="tooltip" :class="'tooltip-' + tipState.placement" :style="{ left: tipState.x + 'px', top: tipState.y + 'px', '--arrow': tipState.arrowOffset + 'px' }">{{ tipState.text }}</div>
    </transition>

    <!-- 变量值悬浮提示 -->
    <transition name="fade">
      <div v-if="varTip.show" class="var-tip" :style="varTip.pos">
        <div v-for="v in varTip.vars" :key="v.name" class="var-tip-row">
          <span class="var-tip-name">{{ v.name }}</span>
          <span class="var-tip-eq">=</span>
          <span class="var-tip-val">{{ v.value }}</span>
        </div>
      </div>
    </transition>

    <!-- 自定义确认弹层 -->
    <transition name="fade">
      <div v-if="confirmState.show" class="modal-mask" v-dialog="'确认操作'" @click.self="confirmCancel">
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
    <HelpModal :open="helpOpen" @close="helpOpen = false" />

    <transition name="toast-slide">
      <div v-if="toastState.show" class="toast" :class="toastState.type">
        <span class="toast-icon" v-if="toastState.type === 'success'">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <span class="toast-icon" v-else-if="toastState.type === 'error'">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>
        </span>
        <span class="toast-icon" v-else>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>
        </span>
        <span class="toast-msg">{{ toastState.msg }}</span>
        <button v-if="toastState.action" class="toast-action" @click="runToastAction">{{ toastState.action.label }}</button>
      </div>
    </transition>

    <!-- 简易图表弹窗 -->
    <ChartModal
      :open="chartOpen"
      :input="chartInput"
      :type="chartType"
      @close="chartOpen = false"
      @update:input="chartInput = $event"
      @update:type="chartType = $event"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
// 计算核心（纯函数 + mathjs 实例）从独立模块引入，便于单元测试与复用
import {
  math, uid, newLine, trimZeros, formatResult, displayResult, nowTime,
  analyzeError, suggestFix, safeEval, lineFullText, uniqueSheetName,
  isVarDefLine, isValidVarName, isAssignExpr, wrapText, nextUpRecall,
  parseDeps, depSignature, needsSplitHint, HUGE_SHEET_ROWS, scrollTarget
} from './core.js'
import { dialogDirective } from './a11y.js'

// 弹层无障碍（role / 焦点移入 / Tab 循环 / 关闭后焦点归位），见 src/a11y.js
const vDialog = dialogDirective()
// 导出渲染（canvas 排版 / 分页）与汇率数据源各自独立成模块，便于复用与测试
import { renderPaperCanvas, sliceCanvasPages, PDF_PAGE_H } from './export.js'
import { fetchRateSources, fmtRateTime } from './rate.js'
import HelpModal from './components/HelpModal.vue'
import RateCard from './components/RateCard.vue'
import VarPanel from './components/VarPanel.vue'
import ChartModal from './components/ChartModal.vue'
import pkg from '../package.json'
const APP_VERSION = pkg.version
const APP_AUTHOR = pkg.author || '周周'

// ---------- 数据 ----------
// 稿纸默认 0 行（不预留空行），所有行由用户操作（底部回车/载入示例等）产生
const sheets = ref([
  { id: uid(), name: '稿纸1', lines: [] }
])
const activeSheetIndex = ref(0)
const theme = ref('light')
const currentSheet = computed(() => sheets.value[activeSheetIndex.value])
// 长稿纸才启用 content-visibility：让浏览器跳过视口外行的渲染与布局，滚动明显更顺。
// 阈值定在 120 行——短稿纸开了收益为零，却要承担屏外行高度估算不准的副作用。
const DENSE_ROWS = 120
const isDenseList = computed(() => currentSheet.value.lines.length > DENSE_ROWS)

// ---------- 超长稿纸提示 ----------
// 压力测试（npm run stress）量出来的事实：≤400 行从容，1000 行单张稿纸首屏 5.3s、
// 滚动频频掉帧，成本在 DOM 节点数而不是计算。但「卡」的根源是这张纸堆得太长，
// 不是代码跑不快，所以只提示、不拦截，也不自动拆——用户自己的稿纸怎么组织是他决定的。
const SPLIT_HINT_KEY = 'calc_paper_split_hint_off'
function readSplitHintDismissed() {
  try {
    const raw = JSON.parse(localStorage.getItem(SPLIT_HINT_KEY) || '[]')
    return new Set(Array.isArray(raw) ? raw.filter(x => typeof x === 'string') : [])
  } catch (e) { return new Set() } // 存坏了就当没关过，多提示一次不算错
}
const splitHintDismissed = ref(readSplitHintDismissed())
const showSplitHint = computed(() =>
  needsSplitHint(currentSheet.value.lines.length, splitHintDismissed.value, currentSheet.value.id))
function dismissSplitHint() {
  const next = new Set(splitHintDismissed.value)
  next.add(currentSheet.value.id)
  // 稿纸 id 随删除/新建不断产生，只留最近 50 条，别让这串 id 无限长
  while (next.size > 50) next.delete(next.values().next().value)
  splitHintDismissed.value = next
  try { localStorage.setItem(SPLIT_HINT_KEY, JSON.stringify([...next])) }
  catch (e) { console.warn('[calc-paper] 记录提示偏好失败：', e) } // 存不下就只管本次会话，不影响使用
}
function splitHugeSheet() {
  dismissSplitHint() // 用户已经照做拆纸了，别回头再对着旧稿纸提示一遍
  addSheet()
}
// 全局变量作用域：所有稿纸共享同一份变量，面板修改即重算全部稿纸
const varScope = reactive({})
// 变量编辑时的本地草稿（避免输入过程中光标跳动）
const varDrafts = reactive({})
// 稿纸样式：white 白纸 / ruled 横格稿纸 / grid 方格稿纸
const paperStyle = ref('white')
const styleMenuOpen = ref(false)
// 计算结果保留小数位数（默认 3 位，范围 0-12）
const decimalPlaces = ref(3)
function onPrecisionChange(e) {
  let n = parseInt(e.target.value, 10)
  if (Number.isNaN(n)) n = 3
  n = Math.max(0, Math.min(12, n))
  decimalPlaces.value = n
  e.target.value = n
}
// 点击进入编辑：自动全选当前值，方便直接覆盖输入
function onPrecisionFocus(e) {
  const el = e.target
  requestAnimationFrame(() => { try { el.select() } catch (_) {} })
}
// 回车：先确认（change 已触发，这里再保险提交一次），再失焦切出输入框
function onPrecisionEnter(e) {
  onPrecisionChange(e)
  e.target.blur()
}
const isSheetEmpty = computed(() => !currentSheet.value.lines.some(l => l.expr.trim()))

const editingIndex = ref(-1)
const editingName = ref('')
const renameInputs = []
function setRenameInput(el, idx) { if (el) renameInputs[idx] = el; else delete renameInputs[idx] }
const focusedLine = ref(-1)
const latestLineIdx = ref(-1) // 最新通过底部公式框计算出来的行
const quickExpr = ref('')
const bottomInput = ref(null)
const paperBody = ref(null)
const sheetTabs = ref(null)
let toastTimer = null
let saveTimer = null

// 切换稿纸时，把当前标签平滑滚入可视区（标签多时可横向滚动定位）
watch(activeSheetIndex, () => {
  nextTick(() => {
    const sc = sheetTabs.value
    if (!sc) return
    const active = sc.querySelector('.sheet-tab.active')
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  })
})
// 普通鼠标竖向滚轮 → 标签栏横向滚动（单排标签不会纵向滚动，正好借来横滑）
function onTabsWheel(e) {
  const el = e.currentTarget
  if (!el || el.scrollWidth <= el.clientWidth) return
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    el.scrollLeft += e.deltaY
    e.preventDefault()
  }
}

// 自定义 tooltip（带箭头，延迟 300ms，替换原生 title）
const tipState = ref({ show: false, text: '', x: 0, y: 0, placement: 'bottom', arrowOffset: 0 })
let tipTimer = null
function hideTip() {
  clearTimeout(tipTimer)
  tipState.value = { ...tipState.value, show: false }
}
const vTip = {
  mounted(el, binding) {
    const getText = () => {
      const v = typeof binding.value === 'function' ? binding.value() : binding.value
      return v && String(v).trim() ? String(v).trim() : ''
    }
    const onEnter = () => {
      tipTimer = setTimeout(() => {
        const text = getText()
        if (!text) return
        const r = el.getBoundingClientRect()
        const center = r.left + r.width / 2
        const fitsBelow = window.innerHeight - r.bottom > 80
        const placement = fitsBelow ? 'bottom' : 'top'
        const y = placement === 'bottom' ? r.bottom + 6 : r.top - 6
        // 第一帧先按目标中心显示，让 Vue 渲染出实际宽度
        tipState.value = { show: true, text, x: center, y, placement, arrowOffset: 0 }
        // 下一帧读取实际宽度，做整体可见性修正，并计算箭头偏移
        requestAnimationFrame(() => {
          const tipEl = document.querySelector('.tooltip')
          if (!tipEl) return
          const tw = tipEl.getBoundingClientRect().width
          const pad = 8
          let left = center - tw / 2
          left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad))
          const arrowOffset = center - (left + tw / 2)
          tipState.value = { ...tipState.value, x: left + tw / 2, arrowOffset }
        })
      }, 300)
    }
    const onLeave = () => hideTip()
    el._tipEnter = onEnter
    el._tipLeave = onLeave
    el.addEventListener('mouseenter', onEnter)
    el.addEventListener('mouseleave', onLeave)
  },
  unmounted(el) {
    if (el._tipEnter) el.removeEventListener('mouseenter', el._tipEnter)
    if (el._tipLeave) el.removeEventListener('mouseleave', el._tipLeave)
    delete el._tipEnter
    delete el._tipLeave
  }
}

// 引导：初始化时同步从 localStorage 读（避免首屏大卡一闪再消失）
let _guideInit = true
try { _guideInit = !localStorage.getItem('calc_paper_guide_dismissed') } catch (e) { console.warn('[calc-paper] 读取引导标记失败：', e) }
const guideOpen = ref(_guideInit)
function dismissGuide() {
  guideOpen.value = false
  try { localStorage.setItem('calc_paper_guide_dismissed', '1') } catch (e) { console.warn('[calc-paper] 写入引导标记失败：', e) }
}
function loadExample() {
  pushUndo()
  currentSheet.value.lines = [
    { ...newLine(), expr: '55+888+999', note: '订单金额' },
    { ...newLine(), expr: '1942*0.85', note: '85折后' },
    { ...newLine(), expr: 'tax=0.13', note: '税率变量' },
    { ...newLine(), expr: '1650*tax', note: '含税额' },
    { ...newLine(), expr: 'min(1650, 1942)', note: '聚合函数' }
  ]
  rebuildScope()
  dismissGuide()
  toast('已载入示例', { type: 'success' })
}

// 帮助
const helpOpen = ref(false)

// 撤销/重做栈（只聚焦数据：稿纸内容 + 当前稿纸标签；刻意不含 quickExpr / focusedLine / latestLineIdx 等界面状态）
// 理由：输入框里未提交的内容、行高亮属于「正在进行的界面操作」，若被快照回退会打断用户；
// 撤销/重做只管数据本身，界面保持现状（仅做越界钳制，见 applySnapshot）。
// 写法：每次改动前把「当前态」压入 undoStack；撤销时把「当前态」压入 redoStack 再回到上一态；
// 重做则反向搬回。两个栈互为镜像，因此 redoStack 长度天然 ≤ undoStack 上限，无需再单独限长。
const undoStack = ref([])
const redoStack = ref([])
const MAX_UNDO = 50
const MAX_SNAP_SIZE = 2 * 1024 * 1024 // 单份快照超 2MB 不压栈，防超大稿纸内存暴涨
function snapshot() {
  return {
    sheets: sheets.value,
    activeSheetIndex: activeSheetIndex.value
  }
}
// 序列化当前态；超限或失败返回 null（表示这一帧不入栈，宁可少一步也不撑爆内存）
function serializeSnapshot() {
  try {
    const snap = JSON.stringify(snapshot())
    return snap.length > MAX_SNAP_SIZE ? null : snap
  } catch (e) {
    console.warn('[calc-paper] 快照失败：', e)
    return null
  }
}
function applySnapshot(snap) {
  sheets.value = snap.sheets
  activeSheetIndex.value = snap.activeSheetIndex
  rebuildScope()
  // 界面状态不动（输入框内容、行高亮保持用户现状）；仅做越界钳制：
  // 撤销删行后，当前高亮行可能已不存在，钳到最后一个合法行，行数为 0 则清空
  const len = currentSheet.value.lines.length
  if (focusedLine.value >= len) focusedLine.value = len > 0 ? len - 1 : -1
  if (latestLineIdx.value >= len) latestLineIdx.value = len > 0 ? len - 1 : -1
  // 浮层状态一并清掉（可能挂在已删行上）
  closeMenus()
  errPopover.value = { ...errPopover.value, show: false }
  varTip.value = { ...varTip.value, show: false }
  completion.value = null
  editingIndex.value = -1
}
// 任何「新操作」前调用：压入撤销栈，同时清空重做栈
// ——已撤销又产生新分支时，旧的重做路径不再成立（与常见编辑器一致）
function pushUndo() {
  flushCompute() // 快照前必须结算挂起的计算，否则会把「还没算出来的旧结果」存进历史
  const snap = serializeSnapshot()
  if (!snap) return
  undoStack.value.push(snap)
  if (undoStack.value.length > MAX_UNDO) undoStack.value.shift()
  redoStack.value = []
}
function undo() {
  if (!undoStack.value.length) { toast('没有可撤销的操作'); return }
  cancelPendingCompute() // 数据即将整体替换，挂起的计算已无意义
  const cur = serializeSnapshot()
  if (cur) redoStack.value.push(cur) // 当前态存入重做栈，供 Ctrl+Y 取回
  applySnapshot(JSON.parse(undoStack.value.pop())) // 内含 rebuildScope
  toast('已撤销')
}
function redo() {
  if (!redoStack.value.length) { toast('没有可重做的操作'); return }
  cancelPendingCompute()
  const cur = serializeSnapshot()
  if (cur) undoStack.value.push(cur) // 当前态存回撤销栈，可继续 Ctrl+Z
  applySnapshot(JSON.parse(redoStack.value.pop())) // 内含 rebuildScope
  toast('已重做')
}

// ---------- 自定义确认 ----------
const confirmState = ref({ show: false, message: '', resolve: null })
function askConfirm(message) {
  // 弹窗打开时把焦点移出输入框，避免背后输入框的 Enter/空格误触发业务，
  // 同时让确认按钮默认不聚焦，符合"危险操作防误触"要求
  if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur()
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

const toastState = ref({ show: false, msg: '', type: 'info', action: null })
function toast(msg, opts = {}) {
  const { type = 'info', duration = 1800, action = null } = opts
  toastState.value = { show: true, msg, type, action }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastState.value = { ...toastState.value, show: false } }, duration)
}
function runToastAction() {
  const a = toastState.value.action
  toastState.value = { ...toastState.value, show: false }
  if (a && typeof a.run === 'function') a.run()
}

// ---------- 计算与格式化 ----------
// 注意：trimZeros / formatResult / displayResult / nowTime / analyzeError / suggestFix / safeEval
// 均已抽取到 src/core.js，本文件仅通过顶部 import 引入。

// 错误详情浮层（点击"公式错误"徽标展开）
const errPopover = ref({ show: false, lIdx: -1, reason: '', suggest: '', pos: {} })
function openErrPopover(lIdx, e) {
  const line = currentSheet.value.lines[lIdx]
  const reason = line.errorMsg || '未知错误'
  const r = e.currentTarget.getBoundingClientRect()
  errPopover.value = {
    show: true, lIdx, reason, suggest: suggestFix(reason),
    pos: { left: `${Math.min(r.left, window.innerWidth - 290)}px`, top: `${r.bottom + 6}px` }
  }
}
function closeErrPopover() { errPopover.value = { ...errPopover.value, show: false } }

// ---------- 增量重算：依赖签名复用 ----------
// 全量重算本身不是问题，问题是它会对每一行都跑一次 mathjs 求值。
// 一行的结果只由三件事决定：算式文本、小数位精度、它读到的那些变量「当时的值」。
// 三者都没变，结果必然一样——于是可以跳过求值，只保持顺序与作用域写入。
// 这比「按变量建反向依赖图再拓扑重算」简单得多，也不需要处理同名变量被后面的行覆盖的情况：
// 循环顺序没变，只是把「算」换成「比对」，语义完全等价。
const depsCache = new Map()   // 算式文本 → { reads, assign }
const lineMemo = new WeakMap() // 行对象 → 上次计算时的条件（不进序列化、不进撤销快照）
// 计数器：让回归脚本能证明「跳过求值」真的发生了，而不是只看结果对不对。
// 只有自增，开销是几次加法，跟一次 mathjs 求值不在一个量级。
const computeStats = { calls: 0, bodies: 0, skipped: 0 }
function depsOf(trimmed) {
  let d = depsCache.get(trimmed)
  if (d === undefined) {
    if (depsCache.size > 500) depsCache.clear() // 反复改字时别让缓存无限膨胀
    d = parseDeps(trimmed)
    depsCache.set(trimmed, d)
  }
  return d
}

function computeLine(line, scope, animate = true) {
  computeStats.calls++
  const trimmed = line.expr.trim()
  // 空行：清结果并让缓存失效（否则算式改回原文时会留下空结果）
  if (!trimmed) { lineMemo.delete(line); computeLineBody(line, scope, animate); return }
  const deps = depsOf(trimmed)
  const sig = depSignature(deps.reads, scope)
  const dp = decimalPlaces.value
  const memo = lineMemo.get(line)
  const reusable = !!memo && memo.expr === trimmed && memo.dp === dp && memo.sig === sig

  if (deps.assign && isValidVarName(deps.assign)) {
    // 赋值行会把值写进作用域，不能像普通行那样「直接跳过」。
    // 但值没变时可以省掉求值，直接把上次写进去的原始值放回去（重建时作用域已被清空）。
    if (reusable && memo.raw !== undefined) { computeStats.skipped++; scope[deps.assign] = memo.raw; return }
    computeLineBody(line, scope, animate)
    lineMemo.set(line, { expr: trimmed, dp, sig, raw: scope[deps.assign] })
    return
  }
  if (reusable) { computeStats.skipped++; return } // 结果不可能变，连动画都不用跑
  computeLineBody(line, scope, animate)
  // sig 记 null 的行（赋值行 / 非法变量名）永不参与复用，避免算式在两种形态间来回改时拿到旧结果
  lineMemo.set(line, { expr: trimmed, dp, sig: deps.assign ? null : sig, raw: undefined })
}

// 真正干活的版本：求值、部分表达式、错误分析、动画
function computeLineBody(line, scope, animate = true) {
  computeStats.bodies++
  if (line.pulse === undefined) line.pulse = false
  if (line.shake === undefined) line.shake = false
  const prevResult = line.result
  const prevError = prevResult === '错误'
  const trimmed = line.expr.trim()
  line.wasAssign = isAssignExpr(trimmed) // 统一维护「是否赋值定义行」，供 onExprInput 做增量判断
  if (!trimmed) {
    line.result = ''; line.partial = false; line.errorMsg = ''
    applyAnim(line, prevResult, prevError, animate); return
  }
  // 只要行内有内容（无论对错）就标记首次尝试时间；空行不标记
  if (!line.time) line.time = nowTime()
  // 安全防护：拒绝把值赋给危险的原型链字段（__proto__/constructor/prototype），防 prototype pollution
  const assignName = trimmed.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?!=)/)?.[1]
  if (assignName && !isValidVarName(assignName)) {
    line.result = '错误'
    line.partial = false
    line.errorMsg = '非法变量名'
    applyAnim(line, prevResult, prevError, animate); return
  }
  const full = safeEval(trimmed, scope, { precision: decimalPlaces.value })
  if (full.ok) {
    line.result = full.value
    line.partial = false
    line.errorMsg = ''
    applyAnim(line, prevResult, prevError, animate); return
  }
  const open = (trimmed.match(/\(/g) || []).length
  const close = (trimmed.match(/\)/g) || []).length
  const incomplete = /[+\-*/^%]$/.test(trimmed) || /=$/.test(trimmed) || /\.$/.test(trimmed) || open > close
  if (incomplete) {
    const attempt = trimmed.replace(/[+\-*/^%]+$/, '').trim()
    if (attempt && attempt !== trimmed) {
      const p = safeEval(attempt, scope, { precision: decimalPlaces.value })
      if (p.ok) {
        line.result = p.value
        line.partial = true
        line.errorMsg = '表达式不完整'
        applyAnim(line, prevResult, prevError, animate); return
      }
    }
    // 无部分值可算：赋值输入中（tax=）不算错；单独符号（+ * ( . 等）按错误处理
    const stripped = trimmed.replace(/=$/, '')
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(stripped)) {
      line.result = ''
      line.partial = false
      line.errorMsg = ''
      applyAnim(line, prevResult, prevError, animate); return
    }
    line.result = '错误'
    line.partial = false
    line.errorMsg = analyzeError(full.error)
    applyAnim(line, prevResult, prevError, animate); return
  }
  line.result = '错误'
  line.partial = false
  line.errorMsg = analyzeError(full.error)
  applyAnim(line, prevResult, prevError, animate)
}

function applyAnim(line, prevResult, prevError, animate) {
  if (!animate) { cancelRoll(line.id); return }
  if (line.result !== '错误' && line.result && !line.partial && line.result !== prevResult) {
    startRoll(line, prevResult) // 数字从旧值滚动到新值
    line.pulse = false
    nextTick(() => { line.pulse = true; setTimeout(() => { line.pulse = false }, 650) })
  }
  if (line.result === '错误' && !prevError) {
    line.shake = false
    nextTick(() => { line.shake = true; setTimeout(() => { line.shake = false }, 500) })
  }
}

// 全局重算：清空变量作用域，按稿纸顺序把所有算式算进同一份 varScope
function rebuildScope() {
  Object.keys(varScope).forEach(k => { delete varScope[k] })
  for (const sh of sheets.value) {
    for (const ln of sh.lines) computeLine(ln, varScope, false)
  }
}

// ---------- 输入计算防抖 ----------
// 连续敲键时每个字符都跑一遍 mathjs 求值是浪费（长稿纸 + 变量依赖时尤其明显）。
// 计算延迟 180ms，但补全与 textarea 高度自适应保持即时，保证输入手感不迟钝。
const COMPUTE_DEBOUNCE = 180
let computeTimer = null
let computePendingIdx = -1
function onExprInput(idx) {
  checkCompletion(idx)        // 补全要跟手，不能延迟
  autosizeExpr(exprRefs[idx]) // 高度自适应同理，兜底
  scheduleCompute(idx)
}
function scheduleCompute(idx) {
  computePendingIdx = idx
  if (computeTimer) clearTimeout(computeTimer)
  computeTimer = setTimeout(flushCompute, COMPUTE_DEBOUNCE)
}
// 立即结算挂起的计算：失焦 / 换行 / 删除行 / 切换稿纸 / 打快照前必须调用，
// 否则结果会停在旧值（快照尤其危险，会把未计算的状态存进撤销栈）。
function flushCompute() {
  if (computeTimer) { clearTimeout(computeTimer); computeTimer = null }
  const idx = computePendingIdx
  if (idx < 0) return
  computePendingIdx = -1
  const line = currentSheet.value.lines[idx]
  if (!line) return
  // 只有「赋值定义行」（name = ...）才会改变全局变量作用域；普通算式行编辑不涉及变量。
  // 用 wasAssign 记录编辑前是否赋值，覆盖「删除赋值」场景（需重算以移除失效变量）；
  // 非赋值行直接跳过昂贵的 JSON.stringify 全量 diff。
  const isAssign = isAssignExpr(line.expr)
  const wasAssign = !!line.wasAssign
  if (isAssign || wasAssign) {
    const varsBefore = JSON.stringify(varScope)
    computeLine(line, varScope)
    if (JSON.stringify(varScope) !== varsBefore) rebuildScope()
  } else {
    computeLine(line, varScope)
  }
}
// 丢弃挂起的计算：撤销/重做会整体替换数据，再执行旧行的计算毫无意义
function cancelPendingCompute() {
  if (computeTimer) { clearTimeout(computeTimer); computeTimer = null }
  computePendingIdx = -1
}

// 行内粘贴：含 \n 时按行拆分到后续新行（与底部框行为一致）
function onExprPaste(idx, e) {
  const text = (e.clipboardData || window.clipboardData)?.getData('text') || ''
  if (!text.includes('\n')) return // 单行：交给默认行为
  e.preventDefault()
  const sh = currentSheet.value
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  if (!lines.length) return
  pushUndo()
  // 当前行：保留光标位置之前 + 粘贴首行；光标后内容追加到首行末尾
  const ta = exprRefs[idx]
  const start = ta?.selectionStart ?? sh.lines[idx].expr.length
  const end = ta?.selectionEnd ?? start
  const before = sh.lines[idx].expr.slice(0, start)
  const after = sh.lines[idx].expr.slice(end)
  const newRows = []
  // 替换当前行为「前半 + 粘贴首行」
  sh.lines[idx].expr = before + lines[0]
  computeLine(sh.lines[idx], varScope)
  // 后续行：第二行起每行一个新行，最后一行带 after
  for (let i = 1; i < lines.length; i++) {
    const isLast = i === lines.length - 1
    const expr = lines[i] + (isLast ? after : '')
    const line = { ...newLine(), expr }
    sh.lines.splice(idx + newRows.length + 1, 0, line)
    newRows.push(line)
    computeLine(line, varScope)
  }
  rebuildScope()
  // 焦点定位到最后一个新行末尾
  const lastNewIdx = idx + newRows.length
  focusedLine.value = lastNewIdx
  latestLineIdx.value = lastNewIdx
  nextTick(() => {
    const el = exprRefs[lastNewIdx]
    if (el) {
      el.focus()
      const pos = sh.lines[lastNewIdx].expr.length
      el.setSelectionRange(pos, pos)
      autosizeExpr(el)
    }
    if (lastNewIdx) locateRow(sh.lines[lastNewIdx].id)
  })
}

// ---------- 焦点 / 行导航 ----------
const exprRefs = []
const noteRefs = []
function setExprRef(el, idx) { if (el) exprRefs[idx] = el; else delete exprRefs[idx] }
function setNoteRef(el, idx) { if (el) noteRefs[idx] = el; else delete noteRefs[idx] }
const rowRefs = {}
function setRowRef(el, id) { if (el) rowRefs[id] = el; else delete rowRefs[id] }

// ---------- 结果数字滚动 ----------
// 直接写 DOM 文本而非走响应式字段：滚动每帧都改值，若放进 reactive 会触发整份模板
// 每帧重渲染（行数多时必然掉帧）。动画结束帧写回与 Vue 渲染结果一致的文本，保持状态同步。
const resultRefs = {}        // lIdx -> 结果 span
function setResultRef(el, idx) { if (el) resultRefs[idx] = el; else delete resultRefs[idx] }
const rollTimers = new Map() // lineId -> rAF 句柄
const ROLL_MS = 320
function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}
function cancelRoll(id) {
  const t = rollTimers.get(id)
  if (t != null) { cancelAnimationFrame(t); rollTimers.delete(id) }
}
function cancelAllRolls() {
  rollTimers.forEach(t => cancelAnimationFrame(t))
  rollTimers.clear()
}
// 旧值 → 新值逐帧插值；非数值 / 量级过大 / 用户偏好减少动效时直接切换，不做动画
function startRoll(line, prevResult) {
  cancelRoll(line.id)
  const rowEl = rowRefs[line.id]
  const el = rowEl && rowEl.querySelector('.result-value')
  if (!el) return
  const to = Number(line.result)
  const from = Number(prevResult)
  const rollable = !!prevResult && Number.isFinite(from) && Number.isFinite(to) &&
    Math.abs(from) < 1e15 && Math.abs(to) < 1e15 && from !== to
  if (!rollable || prefersReducedMotion()) return
  const p = Math.max(0, Math.min(12, decimalPlaces.value))
  const finalText = displayResult(line.result)
  const t0 = performance.now()
  const step = () => {
    // 不用 rAF 的回调参数计时：它与 performance.now() 并非同一时间基（polyfill、部分 WebView、
    // jsdom 都是这样）。一旦参数小于 t0，k 就是负数，插值会冲出荒谬的结果（如「12*3」显示 -12 万），
    // 而且 k<1 恒成立 → 无限 rAF，终值永远写不进去。这里自己取时间并双侧夹紧。
    const k = Math.min(1, Math.max(0, (performance.now() - t0) / ROLL_MS))
    const e = 1 - Math.pow(1 - k, 3) // easeOutCubic
    const v = from + (to - from) * e
    el.textContent = k < 1 ? displayResult(v.toFixed(p)) : finalText
    if (k < 1) rollTimers.set(line.id, requestAnimationFrame(step))
    else rollTimers.delete(line.id)
  }
  rollTimers.set(line.id, requestAnimationFrame(step))
}

// 自适应 textarea 高度：统一由 JS 控制，杜绝 field-sizing 在移动端聚焦瞬间跳变尺寸
function autosizeExpr(el) {
  if (!el) return
  // 长稿纸启用 content-visibility 后，视口外元素的 scrollHeight 恒为 0。
  // 此时不能据此改高度，否则长公式行被压成最小高度；等它进入视口（用户编辑时）再算即可。
  if (!el.scrollHeight) return
  const minH = parseFloat(getComputedStyle(el).minHeight) || 0
  el.style.height = 'auto'
  el.style.height = Math.max(el.scrollHeight, minH) + 'px'
}
function autosizeAllExpr() {
  for (let i = 0; i < exprRefs.length; i++) autosizeExpr(exprRefs[i])
}
// 底部公式框输入：内容高度随动（兜底浏览器）
function onQuickInput() {
  autosizeExpr(bottomInput.value)
  // 用户真的改了内容（与上次 ↑ 填入的不一致）就退出阶梯，下次 ↑ 重新从「上一个结果」开始
  if (quickExpr.value !== upRecall.filled) resetUpRecall()
}

// 滚动兜底定时器统一登记，组件卸载时全部清理，避免销毁后仍触发滚动
const scrollTimers = new Set()
function laterScroll(fn, ms) {
  const t = setTimeout(() => { scrollTimers.delete(t); fn() }, ms)
  scrollTimers.add(t)
  return t
}
// 把最新行滚动到底部可见区：直接操作滚动容器 paperBody。
// 行的进入动画是 opacity+transform（不影响布局），行高在插入后即刻确定。
// 目标夹在 [0, maxScroll] 内，平滑滚动不会 overshoot；不二次强制校正，避免"先到底再回弹"。
function locateRow(id) {
  const container = paperBody.value
  if (!container) return
  const maxScroll = () => Math.max(0, container.scrollHeight - container.clientHeight)
  // 新增的行必然是最后一行：直接滚到容器真实最底部，不再依赖几何推算（padding-bottom 余量问题）。
  const sh = currentSheet.value
  const isLast = sh.lines.length && sh.lines[sh.lines.length - 1].id === id
  requestAnimationFrame(() => {
    if (isLast) {
      container.scrollTo({ top: maxScroll(), behavior: 'smooth' })
      return
    }
    const el = id != null ? rowRefs[id] : null
    if (!el) { container.scrollTo({ top: maxScroll(), behavior: 'smooth' }); return }
    const padTop = parseFloat(getComputedStyle(container).paddingTop) || 0
    // .calc-list 是 position:relative 的直接父，el.offsetTop 相对它；再加容器上内边距得内容区坐标。
    const rowBottom = padTop + el.offsetTop + el.offsetHeight
    const t = Math.min(Math.max(0, rowBottom - container.clientHeight), maxScroll())
    container.scrollTo({ top: t, behavior: 'smooth' })
  })
}

// ---------- 滚动位置记忆 ----------
// 之前每次打开都停在第一行，而真正在算的那几行在最底下——等于每次进来都要往下找一遍。
// 现在按稿纸 id 记住滚动位置：重开 / 切回原稿纸就回到原处；没有记录（首次打开、新建稿纸）
// 直接落到最后一行，也就是用户实际在用的位置。存的只是像素值，不进备份 JSON。
const SCROLL_KEY = 'calc_paper_scroll'
const SCROLL_MAX_SHEETS = 20
function readScrollMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(SCROLL_KEY) || '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out = {}
    for (const k of Object.keys(raw)) if (Number.isFinite(raw[k])) out[k] = raw[k]
    return out
  } catch (e) { return {} } // 存坏了当没记过：最多回不到原位，不碰数据
}
const scrollMap = readScrollMap()
let scrollSaveTimer = null
let scrollDirty = false
// 滚动事件一帧能来十几个，攒 1200ms 写一次盘。位置不是关键数据，丢了最多重开回到旧位置。
function touchScrollMemory() {
  if (!paperBody.value) return
  scrollDirty = true
  if (scrollSaveTimer) return
  scrollSaveTimer = setTimeout(() => { scrollSaveTimer = null; saveScrollNow() }, 1200)
}
function saveScrollNow() {
  if (scrollSaveTimer) { clearTimeout(scrollSaveTimer); scrollSaveTimer = null }
  if (!scrollDirty) return
  scrollDirty = false
  const c = paperBody.value
  const sh = currentSheet.value
  if (!c || !sh) return
  scrollMap[sh.id] = Math.round(c.scrollTop)
  const keys = Object.keys(scrollMap)
  while (keys.length > SCROLL_MAX_SHEETS) delete scrollMap[keys.shift()] // 只留最近 20 张
  try { localStorage.setItem(SCROLL_KEY, JSON.stringify(scrollMap)) }
  catch (e) { /* 存不下就只管本次会话，不值得为它弹提示 */ }
}
// 页签切后台/关闭时落盘：移动端切后台不一定触发 beforeunload
function onVisibilitySaveScroll() {
  if (document.visibilityState === 'hidden') saveScrollNow()
}
// 有记录回记录位置（夹回合法区间，删过行的稿纸会变短）；没记录落到最后一行
function applyScrollMemory() {
  const c = paperBody.value
  const sh = currentSheet.value
  if (!c || !sh) return
  const max = Math.max(0, c.scrollHeight - c.clientHeight)
  c.scrollTop = scrollTarget(scrollMap[sh.id], max, sh.lines.length > 0)
}
// 首帧的 scrollHeight 对长稿纸是估算的（content-visibility 用 120px 占位），一次对不准，
// 布局稳定后再校一次。但校正前先看「视图是不是已经被人挪走了」——用户点了行、聚焦了输入框
// （ensureRowVisible 会滚动），或者程序因为新增行滚到了底部，这时候再拉回启动位置就是抢滚动条。
// 判据用「scrollTop 还是不是我上次设的值」：变了就说明这中间有别人动过，直接放手。
// （一开始用 wheel/touchstart/keydown 做取消信号，结果聚焦滚动不经过这些事件，照样抢——
//   verify.mjs 的拖拽用例就这么被打断的。）
function restoreScrollAfterBoot() {
  const sh = currentSheet.value
  if (!sh || !sh.lines.length) return
  const saved = scrollMap[sh.id]
  let cancelled = false
  const cancel = () => { cancelled = true }
  const sig = { passive: true }
  // 点行、聚焦输入框（ensureRowVisible 会滚动）、新增行滚动，都不经过 wheel/keydown，
  // 所以必须连 pointerdown / focusin 一起听，否则会在用户操作途中把视图拽回去。
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'focusin']
  events.forEach((e) => window.addEventListener(e, cancel, sig))
  let applied = null
  const apply = () => {
    const c = paperBody.value
    if (!c || cancelled) return
    // 这中间有人动过滚动条：直接放手，别跟人抢
    if (applied !== null && Math.abs(c.scrollTop - applied) > 4) { cancelled = true; return }
    c.scrollTop = scrollTarget(saved, Math.max(0, c.scrollHeight - c.clientHeight), true)
    applied = c.scrollTop
  }
  apply() // 首帧就到位，别让人先看见第一行再被拉走
  laterScroll(() => {
    apply()
    events.forEach((e) => window.removeEventListener(e, cancel, sig))
  }, 450)
}

// 行内输入框获得焦点：高亮当前行，并取消"最新计算行"高亮，避免两个高亮并存
function onRowFocus(idx) {
  focusedLine.value = idx
  if (idx !== latestLineIdx.value) latestLineIdx.value = -1
  ensureRowVisible(idx)
  // 聚焦时按内容重算高度：统一由 JS 控制，杜绝 field-sizing 在移动端聚焦瞬间跳变尺寸
  nextTick(() => autosizeExpr(exprRefs[idx]))
}

// 行离场动画前钩子：把起始 max-height 设为当前实际高度，使 .row-leave-to 的 max-height:0 过渡可插值，
// 行在文档流内平滑收起（而非 position:absolute 脱离文档流导致下方行瞬间上跳），删除/清空都更丝滑
function beforeRowLeave(el) {
  if (el.dataset && el.dataset.id) cancelRoll(el.dataset.id) // 行被删，取消它可能还在跑的滚动动画
  el.style.maxHeight = el.offsetHeight + 'px'
  void el.offsetHeight // 强制 reflow，让起始 max-height 生效后再过渡到 0
}

// 仅选中（高亮）当前行，不聚焦输入框、不滚动：用于点击行内按钮等交互
function selectRow(idx) {
  focusedLine.value = idx
  if (idx !== latestLineIdx.value) latestLineIdx.value = -1
}

// 点击行任意区域：输入框交给原生聚焦；按钮仅选中高亮不抢焦点；其余区域聚焦算式/备注
function onRowClick(idx, e) {
  const t = e.target
  if (t.closest('input, textarea, .completion-list')) return
  if (t.closest('button')) { selectRow(idx); return } // 复制/删除等按钮：行选中效果
  // 用户在结果区拖拽选区（想复制）时：点亮当前行高亮，但保留选区、不抢焦点，
  // 否则 focus 会清空选区。视觉选中态与实际焦点解耦，避免两者争抢。
  const sel = window.getSelection()
  if (sel && sel.toString().trim().length > 0) {
    if (focusedLine.value !== idx) selectRow(idx) // 已在该行则跳过，避免无谓重渲染
    return
  }
  if (t.closest('.row-note')) focusNote(idx)
  else focusExpr(idx)
}

// 聚焦行若不完整可见，自动翻页定位：底部露一点→滚到顶部；顶部露一点→滚到底部
function ensureRowVisible(idx) {
  const sh = currentSheet.value
  if (!sh || idx == null || idx < 0 || idx >= sh.lines.length) return
  const container = paperBody.value
  const el = rowRefs[sh.lines[idx].id]
  if (!container || !el) return
  const gap = 8
  // 目标 scrollTop：把行顶对齐可视区顶（mode='top'）/ 把行底对齐可视区底（mode='bottom'）
  const targetTop = (mode) => {
    const rowRect = el.getBoundingClientRect()
    const cRect = container.getBoundingClientRect()
    if (mode === 'top') {
      return Math.max(0, rowRect.top - cRect.top + container.scrollTop - gap)
    }
    return Math.max(0, rowRect.bottom - cRect.top + container.scrollTop + gap - container.clientHeight)
  }
  const cRect = container.getBoundingClientRect()
  const rowRect = el.getBoundingClientRect()
  let mode = null
  if (rowRect.bottom > cRect.bottom - gap) mode = 'top'      // 底部露不全 → 翻到顶
  else if (rowRect.top < cRect.top + gap) mode = 'bottom'   // 顶部露不全 → 翻到底
  if (!mode) return // 已完整可见，不滚动
  container.scrollTo({ top: targetTop(mode), behavior: 'smooth' })
  // 兜底：平滑结束后若仍未到位，瞬时校正
  laterScroll(() => {
    if (Math.abs(container.scrollTop - targetTop(mode)) > 1) {
      container.scrollTo({ top: targetTop(mode), behavior: 'auto' })
    }
  }, 480)
}
function onExprBlur(idx) {
  flushCompute() // 失焦立即结算，别让防抖把结果留在旧值
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
function focusExpr(idx) { nextTick(() => { exprRefs[idx]?.focus({ preventScroll: true }) }) }
function focusNote(idx) { nextTick(() => { noteRefs[idx]?.focus({ preventScroll: true }) }) }
function focusPrevRow(idx) {
  if (idx > 0) focusExpr(idx - 1)
}
function focusNextRow(idx) {
  const lines = currentSheet.value.lines
  if (idx < lines.length - 1) focusExpr(idx + 1)
  else nextTick(() => bottomInput.value?.focus({ preventScroll: true }))
}

// 当前行是否存在可用的补全候选（Enter/Tab/↑↓ 共用）
function hasCompletion(idx) {
  return !!(completion.value && completion.value.lIdx === idx && completion.value.matches.length)
}
// 统一处理补全菜单的键盘行为：返回 true 表示已被补全"吃掉"
function tryCompleteNavigate(idx, dir) {
  if (!hasCompletion(idx)) return false
  const c = completion.value
  if (dir === 'enter' || dir === 'tab') {
    applyCompletion(c.active)
  } else if (dir === 'up') {
    c.active = (c.active - 1 + c.matches.length) % c.matches.length
  } else if (dir === 'down') {
    c.active = (c.active + 1) % c.matches.length
  }
  return true
}
// 回车：有补全先补全，否则跳下一行
// 输入法（中文 / 日文 / 韩文）组合期间的按键属于输入法，不属于应用：
// Enter 用于上屏候选词，↑↓ 用于翻候选页，Esc 用于放弃这次输入。
// 这些键一旦被我们 preventDefault，候选词会直接上不去；被我们当成提交，就会凭空多出一行。
// keyCode 229 是部分浏览器在组合期上报的哨兵值（此时 key 可能是 Unidentified）。
// 因此所有文本输入框的按键处理都要先过这道闸。
function isImeKey(e) {
  return !!e && (e.isComposing === true || e.keyCode === 229)
}
function onExprEnter(idx, e) {
  if (isImeKey(e)) return
  e.preventDefault()
  if (tryCompleteNavigate(idx, 'enter')) return
  focusNextRow(idx)
}
// Tab：有补全先补全，否则跳备注
function onExprTab(idx, e) {
  if (isImeKey(e)) return
  e.preventDefault()
  if (tryCompleteNavigate(idx, 'tab')) return
  focusNote(idx)
}
// 备注框 Tab 回切算式
function onNoteTab(idx, e) {
  if (isImeKey(e)) return
  e.preventDefault()
  focusExpr(idx)
}
// ↑↓：补全下拉时切换候选；行内 textarea 内容多行（软换行也算）时交还默认光标移动，单行时才跳行
function isExprMultiLine(idx) {
  const el = exprRefs[idx]
  return !!el && el.scrollHeight > el.clientHeight + 2
}
function onExprUp(idx, e) {
  if (isImeKey(e)) return // 组合期间 ↑ 归输入法翻候选
  if (tryCompleteNavigate(idx, 'up')) { e.preventDefault(); return }
  if (isExprMultiLine(idx)) return // 多行：允许光标上移
  e.preventDefault()
  focusPrevRow(idx)
}
function onExprDown(idx, e) {
  if (isImeKey(e)) return
  if (tryCompleteNavigate(idx, 'down')) { e.preventDefault(); return }
  if (isExprMultiLine(idx)) return // 多行：允许光标下移
  e.preventDefault()
  focusNextRow(idx)
}

// ---------- 函数自动补全 ----------
const FUNC_LIST = [
  { name: 'sqrt(', desc: '平方根' },
  { name: 'abs(', desc: '绝对值' },
  { name: 'round(', desc: '四舍五入' },
  { name: 'floor(', desc: '向下取整' },
  { name: 'ceil(', desc: '向上取整' },
  { name: 'min(', desc: '最小值' },
  { name: 'max(', desc: '最大值' },
  { name: 'sum(', desc: '求和' },
  { name: 'sin(', desc: '正弦(弧度)' },
  { name: 'cos(', desc: '余弦(弧度)' },
  { name: 'tan(', desc: '正切(弧度)' },
  { name: 'exp(', desc: 'e的x次方' },
  { name: 'log(', desc: '自然对数' },
  { name: 'log10(', desc: '常用对数' },
  { name: 'factorial(', desc: '阶乘' }
]
const FUNC_NAMES = FUNC_LIST.map(f => f.name.replace('(', ''))
const completion = ref(null)
function checkCompletion(idx) {
  const input = exprRefs[idx]
  if (!input) { completion.value = null; return }
  const pos = input.selectionStart
  const before = input.value.slice(0, pos)
  const m = before.match(/([a-zA-Z]{1,})$/)
  if (!m) { completion.value = null; return }
  const word = m[1].toLowerCase()
  const matches = FUNC_LIST.filter(f => f.name.toLowerCase().startsWith(word))
  if (!matches.length) { completion.value = null; return }
  completion.value = { lIdx: idx, start: pos - word.length, word, matches, active: 0 }
}
function applyCompletion(ci) {
  if (!completion.value) return
  const { lIdx, start, word, matches } = completion.value
  const input = exprRefs[lIdx]
  if (!input) return
  const item = matches[ci] || matches[completion.value.active]
  const full = item.name
  const next = input.value.slice(0, start) + full + input.value.slice(start + word.length)
  const sh = currentSheet.value
  const line = sh.lines[lIdx]
  line.expr = next
  computeLine(line, varScope)
  // 补全只插入函数名，普通算式行不产生/改变任何变量，无需全量重算；
  // 只有赋值行（tax=sqr→tax=sqrt(）改变了变量值，才需要重建作用域同步其他稿纸。
  if (isAssignExpr(line.expr) || line.wasAssign) rebuildScope()
  completion.value = null
  nextTick(() => {
    input.focus()
    const caret = start + full.length
    input.setSelectionRange(caret, caret)
  })
}

// ---------- 行操作 ----------
async function delLine(idx) {
  selectRow(idx) // 点删除时当前行先呈选中高亮
  const isLast = currentSheet.value.lines.length <= 1
  // 删掉最后一行也是真删（不再保留空行占位），用"确认清空"文案
  const ok = await askConfirm(isLast ? '确定清空这一行？' : '确定删除这一行？')
  if (!ok) return
  pushUndo()
  // 不论是否最后一行，统一 splice 真正删除；0 行时由引导卡填补
  currentSheet.value.lines.splice(idx, 1)
  if (focusedLine.value === idx) focusedLine.value = -1
  else if (focusedLine.value > idx) focusedLine.value--
  if (latestLineIdx.value === idx) latestLineIdx.value = -1
  else if (latestLineIdx.value > idx) latestLineIdx.value--
  rebuildScope()
  toast(isLast ? '已清空该行' : '已删除该行', { type: 'success', action: { label: '撤销', run: undo } })
}

function addFromBottom(e) {
  if (isImeKey(e)) return // 组合中的 Enter 是上屏候选词，不是提交
  // 从「=」按钮进来时没有事件对象，这里允许 e 为空（按钮本身不需要拦默认行为）
  if (e) e.preventDefault()
  const parts = quickExpr.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  if (!parts.length) { bottomInput.value?.focus({ preventScroll: true }); return }
  pushUndo() // 新增行可撤销（Ctrl+Z 或 toast）
  const sh = currentSheet.value
  let lastId = null
  for (const p of parts) {
    const line = { ...newLine(), expr: p }
    sh.lines.push(line)
    computeLine(line, varScope)
    lastId = line.id
  }
  rebuildScope() // 新增行若定义变量，全局重算所有稿纸
  quickExpr.value = ''
  resetUpRecall() // 提交后输入框清空，↑ 阶梯回到起点
  const newIdx = sh.lines.length - 1
  focusedLine.value = newIdx // 高亮刚计算完成的行
  latestLineIdx.value = newIdx // 独立标记最新计算行，不受 blur 影响
  nextTick(() => {
    bottomInput.value?.focus({ preventScroll: true })
    autosizeExpr(bottomInput.value) // 清空后底部框高度回缩（兜底浏览器）
    if (lastId) locateRow(lastId) // 滚动定位到刚算完的那一行
  })
}

// 底部输入框 ↑ 的三级阶梯状态：stage 走 0→1→2→跳行，filled 记住上一次填入的内容。
// 只有输入框内容仍与 filled 一致，才认为还在阶梯里；用户一动键就退回 0，下次 ↑ 从「上一个结果」重来。
const upRecall = reactive({ stage: 0, filled: '' })
function resetUpRecall() {
  upRecall.stage = 0
  upRecall.filled = ''
}

// 底部公式框 ↑：上一个结果 → 上一个公式 → 历史行（跳进那一行继续编辑）。
// 阶梯判断全在 core.nextUpRecall 里（纯函数、已单测），这里只负责把结果落到界面。
function bottomUp(e) {
  if (isImeKey(e)) return // 组合期间 ↑ 归输入法翻候选，且不能拦掉默认行为
  e.preventDefault()
  const lines = currentSheet.value.lines
  const r = nextUpRecall({ boxText: quickExpr.value, stage: upRecall.stage, filled: upRecall.filled }, lines)
  if (r.jumpTo >= 0) {
    quickExpr.value = ''
    resetUpRecall() // 已离开底部框，回到这里时重新从第一级开始
    nextTick(() => autosizeExpr(bottomInput.value))
    focusExpr(r.jumpTo)
    return
  }
  upRecall.stage = r.stage
  upRecall.filled = r.text
  quickExpr.value = r.text
  nextTick(() => {
    autosizeExpr(bottomInput.value)
    const el = bottomInput.value
    // 光标落到末尾：召回的公式/结果通常要在后面接着写运算符
    if (el) el.setSelectionRange(el.value.length, el.value.length)
  })
}

// 输入框里按 Esc：退出 ↑ 阶梯并清空，不触发全局的弹层关闭逻辑
function bottomEsc(e) {
  if (isImeKey(e)) return // 组合中的 Esc 是取消这次输入，不归应用
  if (upRecall.stage === 0) return
  if (e) e.stopPropagation()
  quickExpr.value = ''
  resetUpRecall()
  nextTick(() => autosizeExpr(bottomInput.value))
}

// ---------- 行拖拽排序 ----------
// 统一走 Pointer 事件，不再用 HTML5 drag API：
// HTML5 `draggable` 在触屏上根本不触发拖动，而样式里已经做了 ≤640px 的 H5 适配，
// 移动端变成「能看不能用」。Pointer 一套逻辑同时覆盖鼠标 / 触屏 / 触控笔，
// 并且能用按下阈值判定，避免点一下手柄就误进拖拽态。
const dragState = ref({ from: -1, to: -1, pos: 'below' })
const DRAG_THRESHOLD = 4 // 纵向位移超过 4px 才认为真的在拖
const dragMeta = { active: false, startY: 0, from: -1, moved: false }

// 用坐标反查落点行：拖拽期间被拖行本身在指针下，其余行才是候选目标
function rowHitTest(x, y) {
  const el = document.elementFromPoint(x, y)
  const row = el && el.closest ? el.closest('.calc-row') : null
  if (!row) return null
  const idx = Number(row.dataset.lidx)
  if (!Number.isInteger(idx) || idx < 0) return null
  const rect = row.getBoundingClientRect()
  return { idx, pos: (y - rect.top) < rect.height / 2 ? 'above' : 'below' }
}

function onHandlePointerDown(e, fromIdx) {
  if (e.button !== undefined && e.button !== 0) return // 只接左键 / 触摸
  dragMeta.active = true
  dragMeta.startY = e.clientY
  dragMeta.from = fromIdx
  dragMeta.moved = false
  window.addEventListener('pointermove', onDragPointerMove)
  window.addEventListener('pointerup', onDragPointerUp)
  window.addEventListener('pointercancel', onDragPointerCancel)
}

function onDragPointerMove(e) {
  if (!dragMeta.active) return
  if (!dragMeta.moved) {
    if (Math.abs(e.clientY - dragMeta.startY) < DRAG_THRESHOLD) return
    dragMeta.moved = true
    dragState.value = { from: dragMeta.from, to: -1, pos: 'below' }
    document.body.classList.add('row-dragging')
  }
  e.preventDefault()
  const hit = rowHitTest(e.clientX, e.clientY)
  if (!hit) return
  // 仅落点变化时才写响应式状态，pointermove 每秒可达数十次，无谓赋值直接拖慢渲染
  if (dragState.value.to !== hit.idx || dragState.value.pos !== hit.pos) {
    dragState.value = { ...dragState.value, to: hit.idx, pos: hit.pos }
  }
}

function onDragPointerUp() {
  if (!dragMeta.active) return
  const { from, to, pos } = dragState.value
  const wasMoved = dragMeta.moved
  finishDrag()
  if (wasMoved && from >= 0 && to >= 0) applyDragMove(from, to, pos)
}

function onDragPointerCancel() { finishDrag() }

function finishDrag() {
  dragMeta.active = false
  dragMeta.moved = false
  dragMeta.from = -1
  document.body.classList.remove('row-dragging')
  window.removeEventListener('pointermove', onDragPointerMove)
  window.removeEventListener('pointerup', onDragPointerUp)
  window.removeEventListener('pointercancel', onDragPointerCancel)
  resetDrag()
}

function applyDragMove(from, to, pos) {
  const lines = currentSheet.value.lines
  let insertAt = pos === 'above' ? to : to + 1
  if (from === insertAt || from === insertAt - 1) { resetDrag(); return }
  pushUndo() // 拖拽重排也支持撤销（与其他改动一致）
  const [item] = lines.splice(from, 1)
  if (from < insertAt) insertAt--
  lines.splice(insertAt, 0, item)
  // 焦点 / 最新行索引同步：被移动行若被追踪则跟到新位置，其余按位移调整
  const movedId = item.id
  const newIdx = lines.findIndex(l => l.id === movedId)
  const fixIdx = (r) => {
    if (r.value < 0) return
    if (r.value === from) r.value = newIdx
    else if (from < r.value && newIdx >= r.value) r.value--
    else if (from > r.value && newIdx <= r.value) r.value++
  }
  fixIdx(focusedLine)
  fixIdx(latestLineIdx)
  rebuildScope()
  resetDrag()
  toast('已调整顺序', { type: 'success', action: { label: '撤销', run: undo } })
}

function resetDrag() { dragState.value = { from: -1, to: -1, pos: 'below' } }

// ---------- 菜单（导出 / 备份 / 行复制） ----------
const copyMenu = ref(null) // { lIdx }
const menuPos = ref({})
// lineFullText 已抽取到 src/core.js

// 「这一行可复制的结果」：『错误』是占位文案不是结果，不能复出去。
// 行内 ⧉ 菜单与右键菜单原本各写一份判断，行内那份漏了这一条，于是复制错误行
// 得到的是「错误」两个字。统一成这一个函数，两处都别再各写一遍。
function resultForCopy(line) {
  const v = line && line.result
  return v && v !== '错误' ? v : ''
}

function openCopyMenu(lIdx, e) {
  selectRow(lIdx) // 点复制时当前行先呈选中高亮
  const line = currentSheet.value.lines[lIdx]
  const res = resultForCopy(line)
  copyMenu.value = {
    lIdx,
    preview: {
      result: res ? displayResult(res) : '（无结果）',
      expr: line.expr.trim() ? line.expr : '（空算式）',
      line: lineFullText(line) || '（空行）'
    }
  }
  const rect = e.currentTarget.getBoundingClientRect()
  menuPos.value = { left: `${Math.min(rect.left, window.innerWidth - 230)}px`, top: `${rect.bottom + 6}px` }
}
function closeMenus() { copyMenu.value = null; rowMenu.value = { ...rowMenu.value, show: false } }
const copyFeedbackIdx = ref(-1)
let copyFbTimer = null
function showCopyFeedback(idx) {
  copyFeedbackIdx.value = idx
  if (copyFbTimer) clearTimeout(copyFbTimer)
  copyFbTimer = setTimeout(() => { copyFeedbackIdx.value = -1 }, 1500)
}
function copyRowAction(type) {
  if (!copyMenu.value) return
  const lIdx = copyMenu.value.lIdx
  const line = currentSheet.value.lines[lIdx]
  const text = type === 'result' ? resultForCopy(line)
    : type === 'expr' ? line.expr
    : lineFullText(line)
  closeMenus()
  if (!text) { toast('此行暂无内容'); return }
  copyText(text).then(ok => {
    if (ok) showCopyFeedback(lIdx)
    else toast('复制失败：剪贴板不可用', { type: 'error' })
  })
}

// ---------- 行右键菜单 ----------
const ROW_MENU_W = 196
const ROW_MENU_H = 340
const rowMenu = ref({ show: false, lIdx: -1, pos: {} })
function openRowMenu(lIdx, e) {
  closeMenus()
  if (!currentSheet.value.lines[lIdx]) return
  selectRow(lIdx) // 右键也点亮当前行，与左键点击行为一致
  // 定位：默认贴光标右下，越界时翻转到左侧 / 上移，保证菜单完整可见
  let x = e.clientX
  let y = e.clientY
  if (x + ROW_MENU_W > window.innerWidth - 8) x = Math.max(8, x - ROW_MENU_W)
  if (y + ROW_MENU_H > window.innerHeight - 8) y = Math.max(8, window.innerHeight - ROW_MENU_H - 8)
  rowMenu.value = { show: true, lIdx, pos: { left: `${x}px`, top: `${y}px` } }
}
function closeRowMenu() { rowMenu.value = { ...rowMenu.value, show: false } }
// 全局拦截：菜单打开期间，任何右键都不该弹出浏览器原生菜单。
// 捕获阶段先于行自身 @contextmenu 处理，逻辑：
//  - 点在菜单内 → 保持
//  - 点在某行 → 移动到该行重新打开（一次右键即可换目标行）
//  - 点在其他位置 → 关闭
function onWinCtx(e) {
  if (!rowMenu.value.show) return
  e.preventDefault()
  const t = e.target
  if (t.closest && t.closest('.row-menu')) return
  const rowEl = t.closest && t.closest('.calc-row')
  if (rowEl && rowEl.dataset && rowEl.dataset.lIdx != null) {
    openRowMenu(Number(rowEl.dataset.lIdx), e)
    return
  }
  closeRowMenu()
}
// 替代原遮罩的左键关闭：菜单外按下即关闭（菜单内的点击由各按钮自行关闭）
// 仅响应左键（button 0），右键交给 onWinCtx 处理，否则右键的 mousedown 会先关掉菜单、导致无法"右键另一行即移动菜单"
function onWinMouseDown(e) {
  if (e.button !== 0) return
  if (rowMenu.value.show && !(e.target.closest && e.target.closest('.row-menu'))) {
    closeRowMenu()
  }
}
// 滚动 / 尺寸变化：菜单是 fixed 定位，不关会飘到错误位置
function onWindowScroll() {
  if (rowMenu.value.show) closeRowMenu()
  // 变量浮层是 fixed 定位，跟着内容滚会飘在错的行上，一滚就收起
  if (varTip.value.show) hideVarTip()
}
// 上移 / 下移：dir 为 -1 或 1
function rowMenuMove(dir) {
  const lIdx = rowMenu.value.lIdx
  const lines = currentSheet.value.lines
  const to = lIdx + dir
  if (to < 0 || to >= lines.length) return
  closeRowMenu()
  pushUndo()
  const [moved] = lines.splice(lIdx, 1)
  lines.splice(to, 0, moved)
  focusedLine.value = to
  latestLineIdx.value = -1
  rebuildScope() // 变量按序依赖，行序变化后需重算
  nextTick(() => ensureRowVisible(to))
}
// offset：0 = 插在上方，1 = 插在下方
function rowMenuInsert(offset) {
  const lIdx = rowMenu.value.lIdx
  closeRowMenu()
  pushUndo()
  const at = lIdx + offset
  currentSheet.value.lines.splice(at, 0, newLine())
  if (focusedLine.value >= at) focusedLine.value++
  if (latestLineIdx.value >= at) latestLineIdx.value++
  nextTick(() => { focusExpr(at); ensureRowVisible(at) })
}
function rowMenuCopy(type) {
  const lIdx = rowMenu.value.lIdx
  const line = currentSheet.value.lines[lIdx]
  closeRowMenu()
  const text = type === 'result' ? resultForCopy(line)
    : type === 'expr' ? line.expr
    : lineFullText(line)
  if (!text) { toast('此行暂无内容'); return }
  copyText(text).then(ok => {
    if (ok) showCopyFeedback(lIdx)
    else toast('复制失败：剪贴板不可用', { type: 'error' })
  })
}
function rowMenuClear() {
  const lIdx = rowMenu.value.lIdx
  closeRowMenu()
  const line = currentSheet.value.lines[lIdx]
  if (!line) return
  if (!line.expr.trim() && !line.note.trim()) { toast('此行已是空行'); return }
  pushUndo()
  line.expr = ''; line.note = ''; line.result = ''; line.partial = false
  line.errorMsg = ''; line.time = ''
  rebuildScope()
  toast('已清空此行', { type: 'success', action: { label: '撤销', run: undo } })
}
async function rowMenuDelete() {
  const lIdx = rowMenu.value.lIdx
  closeRowMenu()
  await delLine(lIdx) // 复用现有删除流程（含二次确认与撤销）
}
// 双击结果数字即复制：复制未格式化的原始数值，便于粘贴到别处继续计算
function copyResultDbl(lIdx) {
  const line = currentSheet.value.lines[lIdx]
  if (!line || !line.result || line.result === '错误') { toast('此行暂无可复制的结果'); return }
  copyText(line.result).then(ok => {
    if (ok) showCopyFeedback(lIdx)
    else toast('复制失败：剪贴板不可用', { type: 'error' })
  })
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
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (e) {
    return legacyCopy(text)
  }
}

// ---------- 底部工具栏功能 ----------
const bottomFocused = ref(false)
const exportMenuOpen = ref(false)
function toggleExportMenu() { exportMenuOpen.value = !exportMenuOpen.value }

// 变量面板
const varPanelOpen = ref(false)
const varEntries = computed(() => {
  return Object.keys(varScope).map(name => {
    const raw = String(varScope[name])
    return { name, raw, value: displayResult(raw) }
  })
})

// 当前正在编辑的变量名（输入期间保留用户输入，不被其他变量的联动重算覆盖）
// 这个变量之前只声明、从未被赋值，注释描述的「跳过正在编辑的变量」其实一直没生效；
// 现在由输入框的 focus/blur 真正维护它。
let focusedVar = null
function onVarFocus(name) { focusedVar = name }
function onVarBlur(name) {
  if (focusedVar === name) focusedVar = null
  syncVarDrafts() // 失焦后把草稿同步回真实值，用户留下的非法中间态（如 "1+"）不该挂在面板上
}

// 变量草稿同步：始终与当前 raw（无千分位的真实值）保持一致，保证面板与稿纸联动一致；
// 仅跳过正在编辑的变量，避免输入中途被覆盖。raw 不含千分位逗号，同步后不会造成"改值变回原值"
function syncVarDrafts() {
  const live = {}
  for (const v of varEntries.value) live[v.name] = v.raw
  for (const k of Object.keys(varDrafts)) if (!(k in live)) delete varDrafts[k]
  for (const k of Object.keys(live)) {
    if (k === focusedVar) continue
    varDrafts[k] = live[k]
  }
}
watch(varEntries, syncVarDrafts)
watch(varPanelOpen, (open) => { if (open) { focusedVar = null; syncVarDrafts() } })

let varTimers = {}
// 变量面板的编辑会直接改定义行（甚至删掉别的稿纸里的同名行），必须能撤销；
// 但 commitVar 由 240ms 防抖反复调用，逐次入栈会在连续输入时把 50 步栈灌满。
// 所以按「变量名 + 1.2s 窗口」合并成一次编辑会话：同一变量连续输入只记一步。
const VAR_EDIT_MERGE_MS = 1200
let varEditSession = { name: null, at: 0 }
function beginVarEdit(name) {
  const now = Date.now()
  if (varEditSession.name === name && now - varEditSession.at < VAR_EDIT_MERGE_MS) {
    varEditSession.at = now
    return
  }
  pushUndo()
  varEditSession = { name, at: now }
}
function endVarEdit() { varEditSession = { name: null, at: 0 } }
// isVarDefLine / isValidVarName 已抽取到 src/core.js
function onVarDraft(name, e) {
  varDrafts[name] = e.target.value
  if (varTimers[name]) clearTimeout(varTimers[name])
  varTimers[name] = setTimeout(() => commitVar(name, e.target.value), 240)
}
function onVarCommit(name) {
  if (varTimers[name]) { clearTimeout(varTimers[name]); delete varTimers[name] }
  const raw = (varDrafts[name] ?? '').trim()
  if (!raw) {
    // 清空输入：还原为当前值，不提交
    const found = varEntries.value.find(v => v.name === name)
    if (found) varDrafts[name] = found.value
    return
  }
  commitVar(name, varDrafts[name])
  endVarEdit() // 回车/失焦算一次编辑结束，下一次输入重新记一步撤销
}
// 手动修改变量：更新其定义行（或新建一行），再全局重算所有稿纸
function commitVar(name, raw) {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return
  // 仅允许"值/表达式"，不允许只填变量名（避免 tax = tax 死循环）
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) return
  // 校验是否为合法数值/表达式（可引用其它已定义变量）
  if (!/^-?\d*\.?\d+$/.test(trimmed)) {
    const r = safeEval(trimmed, varScope, { precision: decimalPlaces.value })
    if (!r.ok) return // 中间非法态，暂不提交
  }
  let target = null
  for (const sh of sheets.value) {
    for (const ln of sh.lines) {
      if (isVarDefLine(ln.expr, name)) { target = ln; break }
    }
    if (target) break
  }
  const expr = `${name} = ${trimmed}`
  // 先算清这次要动什么，再决定要不要入撤销栈：值没变、也没有重复行要清的时候
  // 直接返回，否则用户每敲一个字都会白记一步撤销，把真正的历史挤出 50 步栈。
  let dupCount = 0
  if (target) {
    for (const sh of sheets.value) {
      for (const ln of sh.lines) {
        if (ln !== target && isVarDefLine(ln.expr, name)) dupCount++
      }
    }
  }
  const changed = target ? (target.expr !== expr || dupCount > 0) : true
  if (!changed) return // 值没变、也没有重复行要清：什么都不用做，更不用全量重算
  beginVarEdit(name) // 改数据之前入栈，撤销才能回到「改之前」
  if (target) {
    target.expr = expr
    // 清理同名变量的其他定义行（全局 varScope 共享，后定义覆盖前定义——多行重复会让面板与某行显示矛盾）
    for (const sh of sheets.value) {
      for (let i = sh.lines.length - 1; i >= 0; i--) {
        const ln = sh.lines[i]
        if (ln !== target && isVarDefLine(ln.expr, name)) sh.lines.splice(i, 1)
      }
    }
  } else {
    currentSheet.value.lines.push({ ...newLine(), expr })
  }
  rebuildScope()
  // 删行必须说出来。这一步会动到别的稿纸，用户眼睛盯着变量面板，看不到背后少了一行，
  // 只留一个「撤销」按钮把它变成可回滚的操作。
  if (dupCount > 0) {
    toast(`已合并 ${dupCount} 处同名定义`, { type: 'success', duration: 4000, action: { label: '撤销', run: undo } })
  }
}

// 稿纸样式切换（白纸 / 横格 / 方格），持久化
// 变量面板复制值：把原始值（不带千分位）复制到剪贴板
function copyVarValue(name, raw) {
  copyText(String(raw)).then(ok => ok && toast('已复制 ' + name, { type: 'success' }))
}

function setPaperStyle(s) {
  paperStyle.value = s
  styleMenuOpen.value = false
  scheduleSave()
}

// 复制全部结果
async function copyAllResults() {
  const lines = currentSheet.value.lines.filter(l => l.expr.trim())
  if (!lines.length) { toast('当前稿纸没有可复制的内容'); return }
  const ok = await copyText(lines.map(lineFullText).join('\n'))
  toast(ok ? '已复制全部结果' : '复制失败：剪贴板不可用', { type: ok ? 'success' : 'error' })
}

// 文件下载辅助
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function sheetExportName() {
  return (currentSheet.value.name || '稿纸').replace(/[\\/:*?"<>|]/g, '_')
}

// ---------- 备份：整份数据的可回灌格式 ----------
// Markdown / PNG / PDF 都是「给人看」的成品，回不来。这份 JSON 是唯一能把数据搬回来的东西：
// 换设备、清缓存、隐私模式之后靠它复原，所以导出要包含全部稿纸而不只是当前这张。
const backupInput = ref(null)
function backupStamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}
function exportBackup() {
  exportMenuOpen.value = false
  flushCompute() // 备份必须存算完的状态，别把挂起的旧结果一起写进去
  const payload = {
    app: 'calc-paper',
    schema: 1,          // 结构版本：以后改数据结构时靠它判断能不能直接灌
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    state: serializeState()
  }
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `计算稿纸-备份-${backupStamp()}.json`
  )
  toast('已导出备份', { type: 'success' })
}
function pickBackup() {
  exportMenuOpen.value = false
  backupInput.value?.click()
}
// 读文件 → 归一化 → 二次确认 → 覆盖。任何一步不对就明确报错，
// 绝不「部分导入」——半份数据比没有更难查。
async function onBackupFile(e) {
  const file = e?.target?.files?.[0]
  if (!file) return
  if (e?.target) e.target.value = '' // 清空，允许再次选同一个文件
  if (file.size > 8 * 1024 * 1024) { toast('备份文件过大（超过 8MB）', { type: 'error' }); return }
  let parsed
  try {
    parsed = JSON.parse(await file.text())
  } catch (_) {
    toast('这不是合法的 JSON 文件', { type: 'error' })
    return
  }
  // 兼容两种来源：本应用导出的 { state: … }，以及直接拿 calc_paper_state 的裸数据
  const norm = normalizeState(parsed && parsed.state ? parsed.state : parsed)
  if (!norm) { toast('备份里没有可用的稿纸数据', { type: 'error' }); return }
  const inRows = norm.sheets.reduce((n, s) => n + s.lines.length, 0)
  const curRows = sheets.value.reduce((n, s) => n + s.lines.length, 0)
  const ok = await askConfirm(
    `用备份覆盖当前数据？\n\n备份：${norm.sheets.length} 张稿纸 / ${inRows} 行\n当前：${sheets.value.length} 张稿纸 / ${curRows} 行\n\n覆盖后可用 Ctrl+Z 撤销一次。`
  )
  if (!ok) return
  pushUndo()
  try {
    applyNormalizedState(norm)
  } catch (err) {
    // 归一化后理论上不会走到这里，但真走到了必须能退回去：applyNormalizedState 已经
    // 替换过 sheets，直接返回会让界面停在半套数据上，所以用刚入栈的快照还原。
    console.error('[calc-paper] 应用备份失败：', err)
    undo()
    toast('备份结构异常，已取消导入', { type: 'error' })
    return
  }
  flushSave() // 立刻落盘，别让用户以为恢复了却还在防抖队列里
  toast(`已恢复 ${norm.sheets.length} 张稿纸 / ${inRows} 行`, { type: 'success', duration: 2400 })
}

// 导出 Markdown
function exportMarkdown() {
  exportMenuOpen.value = false
  flushCompute() // 结算挂起的计算：防抖还没跑完就导出会拿到上一次的结果，算式与结果错配
  const sh = currentSheet.value
  const lines = sh.lines.filter(l => l.expr.trim())
  const d = new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  let md = `# ${sh.name}\n\n> 计算稿纸导出 · ${stamp}\n\n`
  const vars = varScope
  if (Object.keys(vars).length) {
    md += '**变量**\n\n'
    for (const [k, val] of Object.entries(vars)) md += `- ${k} = ${displayResult(String(val))}\n`
    md += '\n'
  }
  if (!lines.length) md += '_（暂无算式）_\n'
  for (const l of lines) {
    const res = (l.result && l.result !== '错误') ? ' = ' + displayResult(l.result) : (l.errorMsg ? ' ⚠ 错误' : '')
    md += `- \`${l.expr.trim()}\`${res}${l.note.trim() ? ` _（${l.note.trim()}）_` : ''}\n`
  }
  downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${sheetExportName()}.md`)
  toast('已导出 Markdown', { type: 'success' })
}

// 导出：渲染细节在 src/export.js，这里只负责菜单状态、下载与提示
function exportImage() {
  exportMenuOpen.value = false
  flushCompute() // 同上：先结算再排版
  const paper = renderPaperCanvas({
    name: currentSheet.value.name,
    lines: currentSheet.value.lines,
    isDark: theme.value === 'dark'
  })
  if (!paper) { toast('导出图片失败', { type: 'error' }); return }
  paper.canvas.toBlob((blob) => {
    if (!blob) { toast('导出图片失败', { type: 'error' }); return }
    downloadBlob(blob, `${sheetExportName()}.png`)
    toast('已导出图片', { type: 'success' })
  }, 'image/png')
}

// 导出 PDF：超过一页高度就分页，不再把几十行硬压进一页
function exportPdf() {
  exportMenuOpen.value = false
  flushCompute() // 同上：先结算再排版（要写在异步 import 之前）
  import('jspdf').then(({ default: jsPDF }) => {
    const paper = renderPaperCanvas({
      name: currentSheet.value.name,
      lines: currentSheet.value.lines,
      isDark: theme.value === 'dark'
    })
    if (!paper) { toast('导出 PDF 失败', { type: 'error' }); return }
    const { canvas, cssW, cssH, breaks } = paper
    // 传行首切点：不把一行拦腰切断（固定 1120px 硬切必然切穿某一行）
    const pages = sliceCanvasPages(canvas, cssW, cssH, PDF_PAGE_H, breaks)
    if (!pages.length) { toast('导出 PDF 失败', { type: 'error' }); return }
    const pdf = new jsPDF({
      orientation: pages[0].cssW >= pages[0].cssH ? 'landscape' : 'portrait',
      unit: 'px',
      format: [pages[0].cssW, pages[0].cssH]
    })
    pages.forEach((pg, i) => {
      if (i > 0) pdf.addPage([pg.cssW, pg.cssH], 'portrait')
      pdf.addImage(pg.canvas.toDataURL('image/png'), 'PNG', 0, 0, pg.cssW, pg.cssH, undefined, 'FAST')
    })
    pdf.save(`${sheetExportName()}.pdf`)
    toast(pages.length > 1 ? `已导出 PDF（共 ${pages.length} 页）` : '已导出 PDF', { type: 'success' })
  }).catch(() => toast('导出 PDF 失败（jspdf 未加载）', { type: 'error' }))
}

// ---------- 简易图表 ----------
const chartOpen = ref(false)
const chartInput = ref('')
const chartType = ref('bar')
function openChart() {
  chartOpen.value = true
  if (!chartInput.value) chartInput.value = '12, 30, 25, 40, 18'
}
// ---------- 稿纸操作 ----------
// uniqueSheetName 已抽取到 src/core.js
function addSheet() {
  pushUndo() // 与删除稿纸对齐：新建也能撤销
  const base = `稿纸${sheets.value.length + 1}`
  sheets.value.push({ id: uid(), name: uniqueSheetName(base, sheets.value.map(s => s.name)), lines: [] })
  activeSheetIndex.value = sheets.value.length - 1
  resetUpRecall() // 新稿纸为空，↑ 阶梯从头开始
}
function switchSheet(idx) {
  flushCompute() // 切走前结算，否则挂起的计算会算到已切换的稿纸上
  saveScrollNow() // 切走前把这张稿纸的滚动位置落下来（防抖可能还没写）
  activeSheetIndex.value = idx
  focusedLine.value = -1
  latestLineIdx.value = -1
  resetUpRecall() // 换了稿纸，↑ 阶梯里的「上一个」已不成立，回到起点
  closeMenus()
  completion.value = null
  errPopover.value = { ...errPopover.value, show: false }
  varTip.value = { ...varTip.value, show: false }
}
// 切稿纸 / 新建 / 删除 / 撤销都会改 activeSheetIndex，统一在这里把视图挪到该稿纸
// 记得的位置，不必每个入口各写一遍（漏一个就会出现「切回去还停在上一张的滚动高度」）。
watch(activeSheetIndex, () => { nextTick(applyScrollMemory) })
function startRename(idx) {
  editingIndex.value = idx
  editingName.value = sheets.value[idx].name
  nextTick(() => {
    const el = renameInputs[idx]
    if (el) { el.focus(); el.select() } // 先 focus 再全选
  })
}
function commitRename() {
  if (editingIndex.value < 0) return
  const idx = editingIndex.value
  const raw = editingName.value.trim()
  editingIndex.value = -1
  if (!raw) return
  const sh = sheets.value[idx]
  if (!sh || sh.name === raw) return // 名字没变：不留一步空撤销
  // 新建/删除/拖拽/清空都能 Ctrl+Z，重命名不能就很不一致
  pushUndo()
  // 排除自己再判重。否则「稿纸1 改成 稿纸1」会被改成「稿纸1 (2)」，
  // 而且两张同名稿纸导出时文件名会互相覆盖。
  const others = sheets.value.filter((_, i) => i !== idx).map(s => s.name)
  const finalName = uniqueSheetName(raw, others)
  sh.name = finalName
  if (finalName !== raw) toast(`已有同名稿纸，已改为「${finalName}」`, { type: 'info', duration: 2400 })
}
function cancelRename() {
  editingIndex.value = -1
}
async function delSheet(idx) {
  if (sheets.value.length <= 1) { toast('至少保留一份稿纸', { type: 'error' }); return }
  const ok = await askConfirm(`确定删除「${sheets.value[idx].name}」？`)
  if (!ok) return
  pushUndo()
  sheets.value.splice(idx, 1)
  if (activeSheetIndex.value === idx) activeSheetIndex.value = Math.min(idx, sheets.value.length - 1)
  else if (activeSheetIndex.value > idx) activeSheetIndex.value--
  // 被删稿纸里定义的变量必须一并丢弃，否则会残留在 varScope：变量面板继续显示它，
  // 其余稿纸仍能引用一个已经不存在的定义。与 clearSheet / clearAllSheets 保持一致。
  rebuildScope()
}
async function clearSheet() {
  if (isSheetEmpty.value) return
  const ok = await askConfirm(`清空「${currentSheet.value.name}」的所有算式？`)
  if (!ok) return
  pushUndo()
  currentSheet.value.lines = []
  focusedLine.value = -1
  latestLineIdx.value = -1
  rebuildScope() // 清空后丢弃本稿纸定义的变量，全局重算
  toast('已清空当前稿纸', { type: 'success', action: { label: '撤销', run: undo } })
  // 清空后内容回缩，平滑滚回顶部，避免 scrollTop 超出新高度被硬截断跳变
  nextTick(() => { const c = paperBody.value; if (c) c.scrollTo({ top: 0, behavior: 'smooth' }) })
}
async function clearAllSheets() {
  const ok = await askConfirm('确定清空所有稿纸？清空后可通过撤销恢复。')
  if (!ok) return
  pushUndo()
  sheets.value = [{ id: uid(), name: '稿纸1', lines: [] }]
  activeSheetIndex.value = 0
  focusedLine.value = -1
  latestLineIdx.value = -1
  rebuildScope() // 清空后变量作用域一并重置
  toast('已清空所有稿纸', { type: 'success', action: { label: '撤销', run: undo } })
  nextTick(() => { const c = paperBody.value; if (c) c.scrollTo({ top: 0, behavior: 'smooth' }) })
}

// ---------- 汇率填入公式（独立按钮，不影响其他功能） ----------
// 数据源与降级顺序在 src/rate.js，这里只维护 UI 状态与「填入底部公式框」的行为
const rateLoading = ref(false)
const rateCard = ref(null) // { rate, time, nextUpdate, source, filled }
const rateCountdown = ref(0) // 剩余秒数，倒计时结束自动关闭
let rateTimer = null
function startRateCountdown() {
  clearInterval(rateTimer)
  rateCountdown.value = 5
  rateTimer = setInterval(() => {
    rateCountdown.value -= 1
    if (rateCountdown.value <= 0) closeRateCard()
  }, 1000)
}
function closeRateCard() {
  clearInterval(rateTimer)
  rateCountdown.value = 0
  rateCard.value = null
  // 关闭后仅当焦点不在行内编辑时，才把光标聚焦回底部公式框（避免抢走正在编辑的焦点）
  const ae = document.activeElement
  const inRow = ae && ae.closest && ae.closest('.calc-row')
  if (!inRow) nextTick(() => { bottomInput.value?.focus() })
}

async function fetchRateToInput() {
  if (rateLoading.value) return
  rateLoading.value = true
  try {
    const data = await fetchRateSources()
    // 自动填入底部公式框（沿用原行为）
    fillRateToFormula(data.rate)
    // 弹出说明卡片，标注实际采用的数据源
    rateCard.value = { rate: data.rate, time: data.time, nextUpdate: data.nextUpdate, source: data.source, filled: true }
    startRateCountdown()
  } catch (e) {
    toast('获取汇率失败，请检查网络', { type: 'error', action: { label: '重试', run: () => fetchRateToInput() } })
  } finally {
    rateLoading.value = false
  }
}
// 把汇率值填入底部公式框：空则直接填；末尾是运算符则追加；否则补 * 再追加
function fillRateToFormula(val) {
  if (quickExpr.value.trim()) {
    const t = quickExpr.value.trimEnd()
    quickExpr.value = /[+\-*/^%]$/.test(t) ? t + val : t + '*' + val
  } else {
    quickExpr.value = val
  }
  // 填入后光标回到公式框末尾，方便继续输入
  nextTick(() => {
    const el = bottomInput.value
    if (el) {
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
    }
  })
}

// ---------- 主题 ----------
// 主题切换：只在切换后的 280ms 内挂过渡类，避免长期给全量元素加 transition 影响动画性能
let themeAnimTimer = null
function toggleTheme() {
  const root = document.documentElement
  root.classList.add('theme-anim')
  if (themeAnimTimer) clearTimeout(themeAnimTimer)
  themeAnimTimer = setTimeout(() => root.classList.remove('theme-anim'), 280)
  theme.value = theme.value === 'light' ? 'dark' : 'light'
}
// 按钮涟漪：事件委托，命中选择器即生效，无需逐个按钮改模板
const RIPPLE_SEL = '.tool-btn, .row-icon, .quick-btn, .sheet-add, .exp-item, .pop-item, .rate-btn-single'
function onRippleDown(e) {
  if (prefersReducedMotion()) return
  const el = e.target.closest && e.target.closest(RIPPLE_SEL)
  if (!el || el.disabled) return
  const r = el.getBoundingClientRect()
  const size = Math.max(r.width, r.height) * 2
  const s = document.createElement('span')
  s.className = 'ripple-wave'
  s.style.width = s.style.height = size + 'px'
  s.style.left = (e.clientX - r.left - size / 2) + 'px'
  s.style.top = (e.clientY - r.top - size / 2) + 'px'
  el.appendChild(s)
  setTimeout(() => s.remove(), 520)
}

// ---------- 全局快捷键 ----------
function onGlobalKeydown(e) {
  if (confirmState.value.show) {
    if (e.key === 'Escape') { e.preventDefault(); confirmCancel() }
    else if (e.key === 'Enter') { e.preventDefault(); confirmOk() }
    return
  }
  if (e.key === 'Escape') {
    if (rowMenu.value.show || copyMenu.value) { closeMenus(); return }
    if (exportMenuOpen.value || styleMenuOpen.value) { exportMenuOpen.value = false; styleMenuOpen.value = false; return }
    if (errPopover.value.show) { closeErrPopover(); return }
    if (varPanelOpen.value) { varPanelOpen.value = false; return }
    if (helpOpen.value) { helpOpen.value = false; return }
    if (rateCard.value) { closeRateCard(); return }
    if (chartOpen.value) { chartOpen.value = false; return } // 与其它弹层保持一致
  }
  // 撤销 / 重做：Ctrl+Z、Ctrl+Shift+Z、Ctrl+Y（macOS 上 Cmd 同样生效）
  // 焦点在输入框内时不拦截，交给浏览器原生的文本撤销，避免抢走输入体验
  const inEditor = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA'
  if ((e.ctrlKey || e.metaKey) && !inEditor) {
    const k = e.key.toLowerCase()
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
    if (k === 'z' && e.shiftKey) { e.preventDefault(); redo(); return }
    if (k === 'y') { e.preventDefault(); redo(); return }
  }
}

// 点击行外（含工具栏/空白/底部框）自动取消"选中行"高亮；
// 行内、行内浮层（复制菜单/错误浮层）、确认弹层上的点击不清除
// （弹层是 modal，点它不该改动背后的选中状态——漏了 .modal-mask 会让人以为选中丢了）
function onDocClick(e) {
  if (e.target.closest('.calc-row, .popover, .modal-mask')) return
  focusedLine.value = -1
  latestLineIdx.value = -1 // 底部添加行产生的"最新计算行"高亮也一并取消
}

// ---------- 持久化 ----------
// ---------- 存储失败：降级 + 常驻「未保存」标记 ----------
// localStorage 写失败最麻烦的地方不是报错，而是「用户看不见」：界面一切照旧，
// 实际从某一刻起所有改动都没落盘。所以这里分三层处理：
//   1) 先自己腾地方——错误日志是最不重要的诊断数据，删掉重试一次；
//   2) 仍然失败就挂常驻标记（标题栏红字），直到下一次保存成功才摘掉；
//   3) 提示里直接给出能用的补救动作：导出备份不经过 localStorage，配额满了照样能用。
const ERROR_LOG_STORE_KEY = 'calc_paper_error_log'
const saveFailed = ref(false)
let storageWarned = false
function warnStorage(msg) {
  console.warn('[calc-paper] ' + msg)
  if (!storageWarned) {
    storageWarned = true
    toast('数据没能存到本机，建议先导出备份', {
      type: 'error',
      duration: 6000,
      action: { label: '导出备份', run: exportBackup }
    })
  }
}
function writeStateOnce() {
  localStorage.setItem('calc_paper_state', JSON.stringify(serializeState()))
}
// 只落盘数据字段：pulse / shake 是动画用的视图状态（每行都会临时置 true 再复位），
// 写进 localStorage 纯属冗余，还会让同一份数据在不同时刻产生不同的快照字符串。
function serializeState() {
  return {
    sheets: sheets.value.map(sh => ({
      id: sh.id,
      name: sh.name,
      lines: sh.lines.map(l => ({
        id: l.id,
        expr: l.expr,
        result: l.result,
        note: l.note,
        time: l.time,
        errorMsg: l.errorMsg,
        partial: l.partial,
        wasAssign: l.wasAssign
      }))
    })),
    activeSheetIndex: activeSheetIndex.value,
    theme: theme.value,
    paperStyle: paperStyle.value,
    decimalPlaces: decimalPlaces.value
  }
}
function saveState() {
  try {
    writeStateOnce()
    if (saveFailed.value) {
      // 上一次失败、这次成功：把标记摘掉，并让下次失败还能再提示一次
      saveFailed.value = false
      storageWarned = false
      toast('已恢复自动保存', { type: 'success' })
    }
    return
  } catch (e) {
    // 降级一：删掉错误日志再试。它只是诊断数据，几十 KB 往往正好是压垮配额的那一点
    let freed = false
    try {
      if (localStorage.getItem(ERROR_LOG_STORE_KEY) !== null) {
        localStorage.removeItem(ERROR_LOG_STORE_KEY)
        freed = true
      }
    } catch (_) { /* 连删除都不让，直接进失败分支 */ }
    if (freed) {
      try {
        writeStateOnce()
        if (saveFailed.value) { saveFailed.value = false; storageWarned = false }
        return
      } catch (_) { /* 腾完还是不够，继续往下报 */ }
    }
    // 降级二：标记未保存 + 引导导出备份（备份走下载，不经 localStorage，配额满了也能用）
    saveFailed.value = true
    warnStorage('保存失败：' + e)
  }
}
// 本地数据解析失败时的原文留档：不能只是 console.warn 然后把空稿纸写回去——
// 那样刷新一次原始数据就彻底没了，用户也没法自己捞。这里把原文留在内存里，
// 启动后主动弹一个「下载原文」的动作，同时另存一份到 localStorage 兜底。
let brokenRaw = null
const BROKEN_KEY_PREFIX = 'calc_paper_state_broken_'
function loadState() {
  let raw = null
  try {
    // 隐私模式下 localStorage 读取本身就可能抛错，单独兜一层
    raw = localStorage.getItem('calc_paper_state')
  } catch (e) {
    console.warn('[calc-paper] 读取本地数据失败：', e)
    return null
  }
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (e) {
    console.warn('[calc-paper] 本地数据解析失败：', e)
    brokenRaw = raw
    try {
      // 只留最近一份，避免坏一次攒一份把 5MB 配额吃光
      const old = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(BROKEN_KEY_PREFIX)) old.push(k)
      }
      old.forEach(k => localStorage.removeItem(k))
      localStorage.setItem(BROKEN_KEY_PREFIX + Date.now(), raw)
    } catch (_) { /* 配额满：内存里还有一份，至少能下载出来 */ }
    return null
  }
}
// 保存分两段等：400ms 防抖（避免每敲一个字就序列化整棵数据）+ 空闲调度（序列化与写盘
// 都不占用输入的关键帧）。空闲回调带 2s 超时兜底，标签页被节流时也能按时落盘。
// saveTimer 在文件顶部的定时器区统一声明。
let idleHandle = null
const hasIdle = typeof requestIdleCallback === 'function'
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    if (!hasIdle) { saveState(); return }
    if (idleHandle) cancelIdleCallback(idleHandle)
    idleHandle = requestIdleCallback(() => { idleHandle = null; saveState() }, { timeout: 2000 })
  }, 400)
}
// 立即落盘：关页 / 卸载时调用，不能等防抖和空闲回调，否则最后几次改动会丢
function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (idleHandle && hasIdle) { cancelIdleCallback(idleHandle); idleHandle = null }
  saveState()
}
// 只有 sheets 需要 deep（行内字段变化也要触发保存）；其余都是标量 ref，
// 浅监听即可，避免对它们做无意义的深度遍历。scheduleSave 自带 400ms 防抖，重复入队无副作用。
watch(sheets, scheduleSave, { deep: true })
watch([activeSheetIndex, theme, paperStyle], scheduleSave)
// 小数位精度变化：全局重算刷新已有结果，并触发保存（合并成一个监听，避免两处都盯 decimalPlaces）
watch(decimalPlaces, () => { rebuildScope(); scheduleSave() })

// ---------- 启动 ----------
// 把「来路不明的状态」归一化成内部结构：缺字段补默认，类型不对就丢弃。
// 首次加载与「从备份恢复」共用这一个函数——两条路径各写一套的话，
// 迟早会出现「从备份恢复少补了某个字段」这种只在特定场景暴露的脏状态。
const PAPER_STYLE_KEYS = ['white', 'ruled', 'grid', 'yellow', 'green']
// 外部数据（备份文件 / 本地存储）可能被手工改过，也可能来自旧版本，字段类型不一定是
// 字符串。归一化这里是唯一一道关：下游 computeLine 直接 line.expr.trim()，模板也直接
// .trim()/.length，一旦漏进数字或对象就抛 TypeError。而 applyNormalizedState 在模块
// 顶层同步执行，一抛就把整个挂载打断 → 白屏，且坏数据随后被 watch 写回存储，刷新也
// 救不回来。所以这里宁可把脏字段归空，也不能原样放行。
// 数字收成字符串是有意的（expr: 123 等于常量算式，比丢掉更合理）；对象/数组/布尔
// 没法和算式对上，一律归空。
function asText(v) {
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return ''
}
function asId(v) {
  return typeof v === 'string' && v ? v : uid()
}
function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!Array.isArray(raw.sheets) || !raw.sheets.length) return null
  const sheetsOut = raw.sheets.map(sh => {
    const src = sh && typeof sh === 'object' ? sh : {}
    return {
      id: asId(src.id),
      name: asText(src.name) || '稿纸',
      lines: (Array.isArray(src.lines) ? src.lines : []).map(l => {
        const line = l && typeof l === 'object' ? l : {}
        const result = asText(line.result)
        return {
          id: asId(line.id),
          expr: asText(line.expr),
          result,
          note: asText(line.note),
          time: asText(line.time) || (result ? nowTime() : ''),
          errorMsg: asText(line.errorMsg),
          partial: !!line.partial,
          wasAssign: !!line.wasAssign,
          pulse: false,
          shake: false
        }
      })
    }
  })
  const rawIdx = typeof raw.activeSheetIndex === 'number' && Number.isFinite(raw.activeSheetIndex)
    ? Math.floor(raw.activeSheetIndex) : 0
  return {
    sheets: sheetsOut,
    activeSheetIndex: Math.min(Math.max(0, rawIdx), sheetsOut.length - 1),
    theme: raw.theme === 'dark' || raw.theme === 'light' ? raw.theme : null,
    paperStyle: PAPER_STYLE_KEYS.includes(raw.paperStyle) ? raw.paperStyle : null,
    decimalPlaces: Number.isInteger(raw.decimalPlaces) && raw.decimalPlaces >= 0 && raw.decimalPlaces <= 12
      ? raw.decimalPlaces : null
  }
}
// 应用归一化后的状态：加载与恢复共用，保证两边落到完全一致的内部形态
function applyNormalizedState(norm) {
  sheets.value = norm.sheets
  activeSheetIndex.value = norm.activeSheetIndex
  if (norm.theme) theme.value = norm.theme
  if (norm.paperStyle) paperStyle.value = norm.paperStyle
  if (norm.decimalPlaces !== null) decimalPlaces.value = norm.decimalPlaces
  rebuildScope() // 结果不落盘，必须按当前作用域重算
}

// 同步加载本地数据：首帧即渲染真实数据（localStorage 读取是同步的）。
// 若放在 onMounted 异步执行，首帧先渲染默认空行、数据到达后再替换，
// transition-group 会把已有行当作"新插入"播放进入动画 → 刷新时整批行跳动闪烁。
// 整段包在 try 里：这里位于模块顶层，任何异常都会让 app 挂载不出来（白屏），
// 而白屏的用户连导出备份的入口都没有。宁可退化成空稿纸也要让应用起来。
let boot = null
try {
  boot = normalizeState(loadState())
} catch (e) {
  console.error('[calc-paper] 本地数据无法解析，已按空稿纸启动：', e)
}
// 顶层先重算一遍：首帧渲染的就是最终结果，避免挂载后再算导致行内容微变
if (boot) {
  try {
    applyNormalizedState(boot) // 内含 rebuildScope
  } catch (e) {
    // 归一化后仍失败说明数据结构里有更深的问题：退回默认空稿纸，保证应用能打开
    console.error('[calc-paper] 恢复本地数据失败，已退回空稿纸：', e)
    sheets.value = [{ id: uid(), name: '稿纸1', lines: [] }]
    activeSheetIndex.value = 0
    rebuildScope()
  }
} else {
  rebuildScope() // 没有本地数据时默认空稿纸也要算一遍
}
onMounted(() => {
  // 暴露计算计数：回归脚本据此断言「增量重算真的跳过了求值」。
  // 只读引用，不提供任何写操作，页面外部改不到内部状态。
  window.__calcPaperStats = computeStats
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('click', onDocClick)
  window.addEventListener('beforeunload', flushSave)
  // 捕获阶段监听：内部滚动容器的滚动也能收到，滚动时关闭固定定位的右键菜单避免飘移
  window.addEventListener('scroll', onWindowScroll, true)
  window.addEventListener('resize', onWindowScroll)
  window.addEventListener('pointerdown', onRippleDown, true)
  // 右键菜单打开期间全局拦截 contextmenu/mousedown，避免第二次右键弹出浏览器原生菜单，并支持右键另一行即移动菜单
  window.addEventListener('contextmenu', onWinCtx, true)
  window.addEventListener('mousedown', onWinMouseDown, true)
  // 标签栏：竖向滚轮转横向滚动（非 passive，才能 preventDefault）
  if (sheetTabs.value) sheetTabs.value.addEventListener('wheel', onTabsWheel, { passive: false })
  // 初始化所有已存在行的 textarea 高度（兜底）
  nextTick(() => { autosizeAllExpr(); restoreScrollAfterBoot() })
  // 关页/隐藏时把滚动位置落下来（移动端切后台不一定触发 beforeunload）
  window.addEventListener('beforeunload', saveScrollNow)
  document.addEventListener('visibilitychange', onVisibilitySaveScroll)
  // 本地数据坏了：明确告诉用户，并给一条真能救回原文的出口
  if (brokenRaw) {
    toast('本地数据损坏，已按空稿纸启动', {
      type: 'error',
      duration: 8000,
      action: {
        label: '下载原文',
        run: () => downloadBlob(new Blob([brokenRaw], { type: 'application/json;charset=utf-8' }), 'calc-paper-broken.json')
      }
    })
  }
})
onUnmounted(() => {
  saveScrollNow()
  document.removeEventListener('visibilitychange', onVisibilitySaveScroll)
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('click', onDocClick)
  window.removeEventListener('beforeunload', flushSave)
  window.removeEventListener('beforeunload', saveScrollNow)
  window.removeEventListener('scroll', onWindowScroll, true)
  window.removeEventListener('resize', onWindowScroll)
  if (sheetTabs.value) sheetTabs.value.removeEventListener('wheel', onTabsWheel)
  window.removeEventListener('pointerdown', onRippleDown, true)
  window.removeEventListener('contextmenu', onWinCtx, true)
  window.removeEventListener('mousedown', onWinMouseDown, true)
  cancelAllRolls()
  cancelPendingCompute()
  clearInterval(rateTimer)
  scrollTimers.forEach(t => clearTimeout(t))
  scrollTimers.clear()
  if (saveTimer) clearTimeout(saveTimer)
  if (idleHandle && hasIdle) { cancelIdleCallback(idleHandle); idleHandle = null }
  if (toastTimer) clearTimeout(toastTimer)
  if (tipTimer) clearTimeout(tipTimer)
  if (copyFbTimer) clearTimeout(copyFbTimer)
  if (varTipTimer) clearTimeout(varTipTimer)
  Object.values(varTimers).forEach(t => clearTimeout(t))
})

// 变量值悬浮提示（算式中引用已定义变量时，hover 显示当前值）
const varTip = ref({ show: false, idx: -1, vars: [], pos: {} })
let varTipTimer = null
// 接收 rect 而不是事件对象：调用方在 80ms 防抖之后才进来，那时事件派发早已结束，
// 规范会把 e.currentTarget 置为 null（原实现每次 hover 都抛 TypeError，浮层从不出现）。
function showVarTip(lIdx, rect) {
  const sh = currentSheet.value
  const vars = varScope
  const line = sh.lines[lIdx]
  if (!line) { hideVarTip(); return }
  const tokens = (line.expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [])
  const seen = new Set()
  const list = []
  for (const name of tokens) {
    if (FUNC_NAMES.includes(name) || name === 'pi' || name === 'e') continue
    if (!(name in vars)) continue
    if (seen.has(name)) continue
    seen.add(name)
    list.push({ name, value: displayResult(String(vars[name])) })
  }
  if (!list.length) { hideVarTip(); return }
  // 靠右的行会把浮层推出屏幕，按视口宽度夹一下（预估卡片宽度 240px）
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 248))
  varTip.value = {
    show: true, idx: lIdx, vars: list,
    pos: { left: `${left}px`, top: `${rect.bottom + 6}px` }
  }
}
function onExprHover(lIdx, e) {
  const rect = e.currentTarget.getBoundingClientRect() // 必须在定时器之前取，之后 currentTarget 就没了
  // 防抖：快速划过整列行时不重复跑正则+遍历
  if (varTipTimer) clearTimeout(varTipTimer)
  varTipTimer = setTimeout(() => { showVarTip(lIdx, rect) }, 80)
}
function hideVarTip() {
  if (varTipTimer) { clearTimeout(varTipTimer); varTipTimer = null }
  varTip.value = { ...varTip.value, show: false }
}
</script>
