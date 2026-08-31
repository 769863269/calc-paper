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
      <div class="paper-body" :class="'paper-' + paperStyle" ref="paperBody">
        <!-- 空状态引导 -->
        <div v-if="guideOpen && isSheetEmpty" class="guide-card">
          <div class="guide-title">欢迎使用计算稿纸 👋</div>
          <p class="guide-sub">多行算式实时计算，回车跳下一行；支持变量、备注、多稿纸，数据自动保存在本机。</p>
          <div class="guide-examples">
            <div class="guide-example">· 算式：<code>55+888+999</code> → <code>= 1,942</code></div>
            <div class="guide-example">· 变量：<code>tax=0.13</code>，下一行用 <code>1000*tax</code></div>
            <div class="guide-example">· 快捷键：<code>Ctrl+Z</code> 撤销 · <code>Ctrl+Y</code> 重做 · <code>Tab</code> 算式⇄备注 · <code>↑</code> 调历史 / 再按选行</div>
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

        <transition-group name="row" tag="div" class="calc-list" @before-leave="beforeRowLeave">
          <div
            v-for="(line, lIdx) in currentSheet.lines"
            :key="line.id"
            class="calc-row"
            :class="{ focused: focusedLine === lIdx, latest: latestLineIdx === lIdx, dragging: dragState.from === lIdx, pulse: line.pulse, shake: line.shake, 'drop-above': dragState.to === lIdx && dragState.pos === 'above', 'drop-below': dragState.to === lIdx && dragState.pos === 'below' }"
            :data-id="line.id"
            :ref="(el) => setRowRef(el, line.id)"
            @click="onRowClick(lIdx, $event)"
            @dragstart="onDragStart($event, lIdx)"
            @dragover.prevent="onDragOver($event, lIdx)"
            @drop="onDrop($event)"
            @dragend="onDragEnd"
          >
            <div class="row-main">
            <div class="expr-wrap" @mouseenter="onExprHover(lIdx, $event)" @mouseleave="hideVarTip">
                <textarea
                  :ref="(el) => setExprRef(el, lIdx)"
                  v-model="line.expr"
                  @input="onExprInput(lIdx)"
                  @paste="onExprPaste(lIdx, $event)"
                  @keydown.enter.prevent="onExprEnter(lIdx)"
                  @keydown.tab.prevent="onExprTab(lIdx)"
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
              <div class="result-block" :class="{ error: line.result === '错误', partial: line.partial, empty: !line.expr.trim() && !line.result }">
                <span class="eq-mark">=</span>
                <span class="result-value">{{ line.result === '错误' ? (line.errorMsg || '错误') : (line.result ? displayResult(line.result) : '') }}</span>
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
                @keydown.tab.prevent="focusExpr(lIdx)"
                @focus="onRowFocus(lIdx)"
                @blur="onNoteBlur(lIdx)"
              />
            </div>

            <div class="row-meta">
              <div class="row-meta-left">
                <span class="drag-handle" v-tip="'拖动排序'" draggable="true">⋮⋮</span>
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
            @keydown.enter.prevent="addFromBottom"
            @keydown.ctrl.enter.prevent="addFromBottom"
            @keydown.up.prevent="bottomUp"
            rows="1"
            placeholder="计算公式（支持粘贴多行，↑ 调历史，再↑ 选行，Ctrl+Enter 执行）"
            spellcheck="false"
          ></textarea>
          <button class="quick-btn" @click="addFromBottom" v-tip="'新增一行（Enter / Ctrl+Enter）'">=</button>
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
              <button class="tool-btn" @click="toggleExportMenu" v-tip="'导出稿纸'">
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

        <!-- 导出菜单点击外部关闭遮罩 -->
        <div v-if="exportMenuOpen || styleMenuOpen" class="popover-mask" @click="exportMenuOpen = false; styleMenuOpen = false"></div>

      </footer>

      <!-- 变量面板：遮罩 + 右侧滑入 -->
      <div v-if="varPanelOpen" class="var-mask" @click="varPanelOpen = false"></div>
      <transition name="slide-right">
        <aside v-if="varPanelOpen" class="var-panel" @click.stop>
          <div class="var-panel-head">
            <div>
              <span class="var-panel-title">变量面板</span>
              <span class="var-panel-sub">所有稿纸共享 · 改值即重算</span>
            </div>
            <button class="var-panel-close" @click="varPanelOpen = false" aria-label="关闭">×</button>
          </div>
          <div class="var-panel-body">
            <p class="var-panel-hint" v-if="!varEntries.length">还没有变量。<br/>在任意稿纸里用 <code>name = 值</code> 定义，例如 <code>tax = 0.13</code>，所有稿纸共享。</p>
            <div v-for="v in varEntries" :key="v.name" class="var-row">
              <span class="var-name">{{ v.name }}</span>
              <span class="var-eq">=</span>
              <input
                class="var-input"
                :value="varDrafts[v.name] ?? v.raw"
                @input="onVarDraft(v.name, $event)"
                @change="onVarCommit(v.name)"
                @focus="focusedVar = v.name"
                @blur="focusedVar = null"
                @keyup.enter="e => e.target.blur()"
                v-tip="'修改后实时重算全部稿纸'"
                spellcheck="false"
              />
              <button class="var-copy" @click="copyText(String(v.raw)).then(ok => ok && toast('已复制 ' + v.name, { type: 'success' }))" v-tip="'复制值'">⧉</button>
            </div>
          </div>
        </aside>
      </transition>
    </div>

    <!-- 汇率说明卡片 -->
    <transition name="fade">
      <div v-if="rateCard" class="rate-mask" @click.self="closeRateCard">
        <div class="rate-card">
          <div class="rate-progress"></div>
          <div class="rate-header">
            <div class="rate-title">
              <span class="rate-flag">$</span>
              <span>参考汇率</span>
            </div>
            <button class="rate-close" @click="closeRateCard" aria-label="关闭">×</button>
          </div>

          <div class="rate-hero">
            <div class="rate-pair">USD → CNY</div>
            <div class="rate-value">
              <span class="rate-unit">1 美元 =</span>
              <span class="rate-number">{{ rateCard.rate }}</span>
              <span class="rate-unit">元</span>
            </div>
          </div>

          <div class="rate-meta">
            <div class="rate-meta-row">
              <svg class="rate-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" stroke-linecap="round"/></svg>
              <div class="rate-meta-item">
                <span class="rate-meta-label">更新时间</span>
                <span class="rate-meta-value">{{ fmtRateTime(rateCard.time) }}</span>
              </div>
            </div>
            <div class="rate-meta-row">
              <svg class="rate-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2" stroke-linecap="round"/></svg>
              <div class="rate-meta-item">
                <span class="rate-meta-label">下次更新</span>
                <span class="rate-meta-value">{{ fmtRateTime(rateCard.nextUpdate) }}</span>
              </div>
            </div>
            <div class="rate-meta-row">
              <svg class="rate-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <div class="rate-meta-item">
                <span class="rate-meta-label">数据来源</span>
                <span class="rate-meta-value">{{ rateCard.source }}</span>
              </div>
            </div>
          </div>

          <p class="rate-note">
            取各大央行参考汇率，每日更新一次，非实时盘面报价，仅供换算参考。实际结汇请以银行实时牌价为准。
          </p>

          <div v-if="rateCard.filled" class="rate-filled-hint">
            <svg class="rate-hint-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            已自动填入底部公式框
          </div>

          <div class="rate-footer">
            <span class="rate-count">{{ rateCountdown }} 秒后自动关闭</span>
            <button class="rate-btn-single" @click="closeRateCard">关闭</button>
          </div>
        </div>
      </div>
    </transition>

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
                <tbody>
                <tr><td><code>+ - * /</code></td><td>加减乘除</td><td>100-20*3 = 40</td></tr>
                <tr><td><code>^</code></td><td>幂运算</td><td>2^10 = 1024</td></tr>
                <tr><td><code>( )</code></td><td>括号，控制优先级</td><td>(100-20)*0.15 = 12</td></tr>
                <tr><td><code>%</code></td><td>取模（余数）</td><td>10%3 = 1</td></tr>
                <tr><td><code>pi</code> <code>e</code></td><td>数学常量</td><td>pi = 3.1415926…</td></tr>
                <tr><td><code>=</code></td><td>定义变量</td><td>tax = 0.13</td></tr>
                              </tbody>
              </table>
            </div>

            <!-- 常用函数 -->
            <div class="help-section">
              <div class="help-head">③ 常用函数</div>
              <table class="help-table">
                <tbody>
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
                              </tbody>
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
                <tbody>
                <tr><td><code>回车</code></td><td>跳下一行（最后一行跳到底部输入框）</td></tr>
                <tr><td><code>Tab</code></td><td>算式 ⇄ 备注 切换</td></tr>
                <tr><td><code>↑</code> / <code>↓</code></td><td>上 / 下移动一行</td></tr>
                <tr><td><code>↑</code>（底部输入框）</td><td>调出最近一条算过的式子；再按 ↑ 进入选择行模式</td></tr>
                <tr><td><code>Ctrl+Z</code></td><td>撤销删除 / 清空（最多 50 步）</td></tr>
                <tr><td><code>Ctrl+Y</code> / <code>Ctrl+Shift+Z</code></td><td>重做（撤销后反悔，恢复被撤销的那一步）</td></tr>
                <tr><td>拖动 <code>⋮⋮</code></td><td>调整算式行的顺序</td></tr>
                <tr><td>标签 ✎ / 双击标签</td><td>重命名稿纸（回车确认，Esc 取消）</td></tr>
                              </tbody>
              </table>
            </div>

            <!-- 数据 -->
            <div class="help-section">
              <div class="help-head">⑥ 数据安全与隐私</div>
              <div class="help-grid">
                所有算式、稿纸、变量、主题等数据<strong>仅保存在本机浏览器（localStorage）</strong>，不会上传到任何服务器。<br />
                关闭页面不丢失；清除本网站浏览数据即可彻底删除。<br />
                导出 / 复制的稿纸内容请自行脱敏，勿泄露账号、金额等敏感信息。<br />
                「汇」按钮仅向公开汇率源（open.er-api.com / ECB / exchangerate-api.com）发起只读请求，不携带任何个人数据。
              </div>
            </div>

            <!-- 参考汇率 -->
            <div class="help-section">
              <div class="help-head">⑦ 参考汇率（汇 按钮）</div>
              <div class="help-grid">
                点工具栏「<b>汇</b>」按钮，获取 <strong>1 美元兑人民币</strong> 的每日参考汇率，<br />
                并自动填入底部公式框（空框直接填；末尾是运算符则追加；否则补 <code>*</code> 再追加）。<br />
                点开后浮层会讲清四件事：<br />
                ① <b>汇率</b>：1 美元 = 多少人民币；<br />
                ② <b>更新时间</b>：数据最后更新时间；<br />
                ③ <b>下次更新</b>：预计下次更新时间；<br />
                ④ <b>数据来源</b>：多数据源自动切换——open.er-api.com（主）→ ECB 欧洲央行（frankfurter.app）→ exchangerate-api.com，任一源成功即采用，卡片会标注实际来源。<br />
                实际结汇请以银行实时牌价为准。
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="modal-btn primary" @click="helpOpen = false">知道了</button>
          </div>
        </div>
      </div>
    </transition>

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
    <transition name="fade">
      <div v-if="chartOpen" class="modal-mask" @click.self="chartOpen = false">
        <div class="modal-card chart-card">
          <div class="chart-head">
            <span class="chart-title">简易图表</span>
            <div class="chart-tabs">
              <button :class="{ active: chartType === 'bar' }" @click="chartType = 'bar'">柱状图</button>
              <button :class="{ active: chartType === 'line' }" @click="chartType = 'line'">折线图</button>
            </div>
            <button class="chart-close" @click="chartOpen = false" aria-label="关闭">×</button>
          </div>
          <div class="chart-input-row">
            <textarea
              v-model="chartInput"
              class="chart-input mono-textarea"
              rows="2"
              placeholder="输入数据：12, 30, 25, 40　或　一月:12, 二月:30, 三月:25"
              spellcheck="false"
            ></textarea>
          </div>
          <div class="chart-canvas">
            <svg v-if="chartPoints.length" :viewBox="chartSvg.viewBox" class="chart-svg" preserveAspectRatio="xMidYMid meet">
              <!-- 网格 + 坐标轴 -->
              <line v-for="(g, i) in chartSvg.gridY" :key="'gy' + i" :x1="g.x1" :y1="g.y1" :x2="g.x2" :y2="g.y2" class="chart-grid" />
              <line :x1="chartSvg.axis.x" :y1="chartSvg.axis.y1" :x2="chartSvg.axis.x" :y2="chartSvg.axis.y2" class="chart-axis" />
              <line :x1="chartSvg.axis.x" :y1="chartSvg.axis.y2" :x2="chartSvg.axis.x2" :y2="chartSvg.axis.y2" class="chart-axis" />
              <!-- 柱状 -->
              <template v-if="chartType === 'bar'">
                <rect
                  v-for="(p, i) in chartPoints"
                  :key="'bar' + i"
                  :x="p.bx"
                  :y="p.y"
                  :width="p.bw"
                  :height="chartSvg.plotH - p.y + chartSvg.padT"
                  rx="3"
                  class="chart-bar"
                />
              </template>
              <!-- 折线 -->
              <template v-else>
                <polyline :points="chartPoints.map(p => p.x + ',' + p.y).join(' ')" class="chart-line" />
                <circle v-for="(p, i) in chartPoints" :key="'pt' + i" :cx="p.x" :cy="p.y" r="3.5" class="chart-dot" />
              </template>
              <!-- 数值标签 -->
              <text v-for="(p, i) in chartPoints" :key="'lb' + i" :x="p.x" :y="p.y - 8" class="chart-val">{{ p.label }}</text>
              <!-- X 轴标签 -->
              <text v-for="(p, i) in chartPoints" :key="'xl' + i" :x="p.x" :y="chartSvg.axis.y2 + 16" class="chart-xlabel">{{ p.name }}</text>
            </svg>
            <p v-else class="chart-empty">输入数据后自动出图</p>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
// 计算核心（纯函数 + mathjs 实例）从独立模块引入，便于单元测试与复用
import {
  math, uid, newLine, trimZeros, formatResult, displayResult, nowTime,
  analyzeError, suggestFix, safeEval, lineFullText, uniqueSheetName,
  isVarDefLine, isValidVarName, isAssignExpr, parseChartInput
} from './core.js'
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

// 撤销/重做栈（恢复完整 UI 状态：稿纸数据 + 底部输入框内容 + 当前焦点行 + 最新计算行）
// 写法：每次改动前把「当前态」压入 undoStack；撤销时把「当前态」压入 redoStack 再回到上一态；
// 重做则反向搬回。两个栈互为镜像，因此 redoStack 长度天然 ≤ undoStack 上限，无需再单独限长。
const undoStack = ref([])
const redoStack = ref([])
const MAX_UNDO = 50
const MAX_SNAP_SIZE = 2 * 1024 * 1024 // 单份快照超 2MB 不压栈，防超大稿纸内存暴涨
function snapshot() {
  return {
    sheets: sheets.value,
    activeSheetIndex: activeSheetIndex.value,
    quickExpr: quickExpr.value,
    focusedLine: focusedLine.value,
    latestLineIdx: latestLineIdx.value
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
  quickExpr.value = snap.quickExpr
  rebuildScope()
  // 索引越界保护：被删行/切换稿纸后，原索引可能失效
  const len = currentSheet.value.lines.length
  focusedLine.value = snap.focusedLine >= 0 && snap.focusedLine < len ? snap.focusedLine : -1
  latestLineIdx.value = snap.latestLineIdx >= 0 && snap.latestLineIdx < len ? snap.latestLineIdx : -1
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
  const snap = serializeSnapshot()
  if (!snap) return
  undoStack.value.push(snap)
  if (undoStack.value.length > MAX_UNDO) undoStack.value.shift()
  redoStack.value = []
}
function undo() {
  if (!undoStack.value.length) { toast('没有可撤销的操作'); return }
  const cur = serializeSnapshot()
  if (cur) redoStack.value.push(cur) // 当前态存入重做栈，供 Ctrl+Y 取回
  applySnapshot(JSON.parse(undoStack.value.pop()))
  rebuildScope() // 撤销后变量作用域需同步重算
  toast('已撤销')
}
function redo() {
  if (!redoStack.value.length) { toast('没有可重做的操作'); return }
  const cur = serializeSnapshot()
  if (cur) undoStack.value.push(cur) // 当前态存回撤销栈，可继续 Ctrl+Z
  applySnapshot(JSON.parse(redoStack.value.pop()))
  rebuildScope()
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

function computeLine(line, scope, animate = true) {
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
  if (!animate) return
  if (line.result !== '错误' && line.result && !line.partial && line.result !== prevResult) {
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

function onExprInput(idx) {
  const sh = currentSheet.value
  const line = sh.lines[idx]
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
  checkCompletion(idx)
  autosizeExpr(exprRefs[idx]) // 兜底：textarea 按内容自适应高度
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

// 自适应 textarea 高度：统一由 JS 控制，杜绝 field-sizing 在移动端聚焦瞬间跳变尺寸
function autosizeExpr(el) {
  if (!el) return
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
function onExprEnter(idx) {
  if (tryCompleteNavigate(idx, 'enter')) return
  focusNextRow(idx)
}
// Tab：有补全先补全，否则跳备注
function onExprTab(idx) {
  if (tryCompleteNavigate(idx, 'tab')) return
  focusNote(idx)
}
// ↑↓：补全下拉时切换候选；行内 textarea 内容多行（软换行也算）时交还默认光标移动，单行时才跳行
function isExprMultiLine(idx) {
  const el = exprRefs[idx]
  return !!el && el.scrollHeight > el.clientHeight + 2
}
function onExprUp(idx, e) {
  if (tryCompleteNavigate(idx, 'up')) { e.preventDefault(); return }
  if (isExprMultiLine(idx)) return // 多行：允许光标上移
  e.preventDefault()
  focusPrevRow(idx)
}
function onExprDown(idx, e) {
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
  sh.lines[lIdx].expr = next
  computeLine(sh.lines[lIdx], varScope)
  rebuildScope() // 补全后立即全局重算，确保依赖该变量的其他稿纸同步更新
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

function addFromBottom() {
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
  const newIdx = sh.lines.length - 1
  focusedLine.value = newIdx // 高亮刚计算完成的行
  latestLineIdx.value = newIdx // 独立标记最新计算行，不受 blur 影响
  nextTick(() => {
    bottomInput.value?.focus({ preventScroll: true })
    autosizeExpr(bottomInput.value) // 清空后底部框高度回缩（兜底浏览器）
    if (lastId) locateRow(lastId) // 滚动定位到刚算完的那一行
  })
}

function historyUp() {
  if (quickExpr.value) return
  const lines = currentSheet.value.lines
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].expr.trim()) {
      quickExpr.value = lines[i].expr
      nextTick(() => autosizeExpr(bottomInput.value)) // 兜底浏览器：召回后高度随内容
      return
    }
  }
}

// 底部公式框 ↑ 键：空框→先召回历史（有历史时）；框内有内容→进入"选择行"模式（聚焦匹配公式的行，并清空底部框，两模式互斥）
function bottomUp() {
  const sh = currentSheet.value
  const lines = sh.lines
  if (!quickExpr.value.trim()) {
    // 空框：有历史先召回填入，下次再按 ↑ 切选择行；没历史但还有行 → 直接进选择行模式
    const hasHistory = lines.some(l => l.expr.trim())
    if (hasHistory) {
      historyUp()
      return
    }
    if (lines.length) {
      quickExpr.value = '' // 底部框保持待命空态
      focusExpr(lines.length - 1)
      return
    }
    return
  }
  if (!lines.length) return
  const q = quickExpr.value.trim()
  let target = lines.length - 1 // 默认最后一行
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].expr.trim() === q) { target = i; break }
  }
  quickExpr.value = '' // 进入选择行模式：清空底部框
  focusExpr(target)
}

// ---------- 行拖拽排序 ----------
const dragState = ref({ from: -1, to: -1, pos: 'below' })
function onDragStart(e, fromIdx) {
  dragState.value = { ...dragState.value, from: fromIdx }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(fromIdx))
}
function onDragOver(e, idx) {
  if (dragState.value.from === -1) return
  const r = e.currentTarget.getBoundingClientRect()
  const pos = (e.clientY - r.top) < r.height / 2 ? 'above' : 'below'
  // 仅在插入位置变化时更新，避免 dragover 高频（每秒数十次）触发重渲染
  if (dragState.value.to !== idx || dragState.value.pos !== pos) {
    dragState.value = { ...dragState.value, to: idx, pos }
  }
}
function onDrop(e) {
  const from = Number(e.dataTransfer.getData('text/plain'))
  if (Number.isNaN(from) || dragState.value.to === -1) return
  const target = dragState.value
  const lines = currentSheet.value.lines
  let insertAt = target.pos === 'above' ? target.to : target.to + 1
  if (from === insertAt || from === insertAt - 1) { resetDrag(); return }
  pushUndo() // 拖拽重排也支持撤销（与其他改动一致）
  const [item] = lines.splice(from, 1)
  if (from < insertAt) insertAt--
  lines.splice(insertAt, 0, item)
  // 焦点/最新行索引同步：被移动行的索引如果被追踪，移到新位置；其他行索引根据位移调整
  const movedId = item.id
  const newIdx = lines.findIndex(l => l.id === movedId)
  const fixIdx = (ref) => {
    if (ref.value < 0) return
    if (ref.value === from) ref.value = newIdx
    else if (from < ref.value && newIdx >= ref.value) ref.value--
    else if (from > ref.value && newIdx <= ref.value) ref.value++
  }
  fixIdx(focusedLine)
  fixIdx(latestLineIdx)
  rebuildScope()
  resetDrag()
  toast('已调整顺序', { type: 'success', action: { label: '撤销', run: undo } })
}
function onDragEnd() { resetDrag() }
function resetDrag() { dragState.value = { from: -1, to: -1, pos: 'below' } }

// ---------- 菜单（导出 / 备份 / 行复制） ----------
const copyMenu = ref(null) // { lIdx }
const menuPos = ref({})
// lineFullText 已抽取到 src/core.js

function openCopyMenu(lIdx, e) {
  selectRow(lIdx) // 点复制时当前行先呈选中高亮
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
  const text = type === 'result' ? (line.result || '')
    : type === 'expr' ? line.expr
    : lineFullText(line)
  closeMenus()
  if (!text) { toast('此行暂无内容'); return }
  copyText(text).then(ok => {
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
let focusedVar = null

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
}

// 稿纸样式切换（白纸 / 横格 / 方格），持久化
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

// 导出 Markdown
function exportMarkdown() {
  exportMenuOpen.value = false
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

// 圆角矩形路径
function roundRect(c, x, y, w, h, r) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

// 自绘稿纸 canvas（图片 / PDF 共用）
function renderPaperCanvas() {
  const sh = currentSheet.value
  const lines = sh.lines.filter(l => l.expr.trim())
  const isDark = theme.value === 'dark'
  const bg = isDark ? '#1e2128' : '#ffffff'
  const text = isDark ? '#f5f5f7' : '#1d1d1f'
  const sub = isDark ? 'rgba(245,245,247,0.55)' : 'rgba(0,0,0,0.45)'
  const accent = isDark ? '#0a84ff' : '#0071e3'
  const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
  const scale = 2
  const padX = 40, padTop = 64, padBottom = 36, rowH = 46, gap = 10
  const W = 720
  const H = padTop + padBottom + Math.max(1, lines.length) * (rowH + gap)
  const cv = document.createElement('canvas')
  cv.width = W * scale
  cv.height = H * scale
  const c = cv.getContext('2d')
  if (!c) return null
  c.scale(scale, scale)
  c.fillStyle = bg
  roundRect(c, 0, 0, W, H, 18); c.fill()
  // 标题 + 日期
  c.textBaseline = 'top'
  c.fillStyle = text
  c.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  c.fillText(sh.name || '计算稿纸', padX, 24)
  c.fillStyle = sub
  c.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  const now = new Date()
  c.fillText(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`, padX, 54)
  c.strokeStyle = border
  c.beginPath(); c.moveTo(padX, padTop - 12); c.lineTo(W - padX, padTop - 12); c.stroke()
  // 行
  let y = padTop
  c.font = '15px "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace'
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    c.fillStyle = text
    c.fillText(l.expr.trim(), padX, y)
    const res = (l.result && l.result !== '错误') ? displayResult(l.result) : (l.errorMsg ? '错误' : '')
    c.fillStyle = res === '错误' ? '#ff3b30' : accent
    const rw = c.measureText(res).width
    c.fillText(res, W - padX - rw, y)
    if (l.note.trim()) {
      c.fillStyle = sub
      c.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      const nw = c.measureText(l.note.trim()).width
      c.fillText(l.note.trim(), W - padX - nw, y + 20)
      c.font = '15px "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace'
    }
    y += rowH
    if (i < lines.length - 1) {
      c.strokeStyle = border
      c.beginPath(); c.moveTo(padX, y - gap / 2); c.lineTo(W - padX, y - gap / 2); c.stroke()
    }
  }
  if (!lines.length) {
    c.fillStyle = sub
    c.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    c.fillText('（暂无算式）', padX, y)
  }
  return { canvas: cv, cssW: W, cssH: H }
}

// 导出图片（PNG）
function exportImage() {
  exportMenuOpen.value = false
  const paper = renderPaperCanvas()
  if (!paper) { toast('导出图片失败', { type: 'error' }); return }
  paper.canvas.toBlob((blob) => {
    if (!blob) { toast('导出图片失败', { type: 'error' }); return }
    downloadBlob(blob, `${sheetExportName()}.png`)
    toast('已导出图片', { type: 'success' })
  }, 'image/png')
}

// 导出 PDF 稿纸
function exportPdf() {
  exportMenuOpen.value = false
  import('jspdf').then(({ default: jsPDF }) => {
    const paper = renderPaperCanvas()
    if (!paper) { toast('导出 PDF 失败', { type: 'error' }); return }
    const { canvas, cssW, cssH } = paper
    const img = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: cssW >= cssH ? 'landscape' : 'portrait', unit: 'px', format: [cssW, cssH] })
    pdf.addImage(img, 'PNG', 0, 0, cssW, cssH)
    pdf.save(`${sheetExportName()}.pdf`)
    toast('已导出 PDF', { type: 'success' })
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
// 解析输入：支持 "12,30" 或 "一月:12, 二月:30"（纯解析逻辑在 core.parseChartInput）
const chartData = computed(() => parseChartInput(chartInput.value))
const chartSvg = computed(() => {
  const data = chartData.value
  const W = 560, H = 300, padL = 44, padR = 24, padT = 20, padB = 40
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const maxV = Math.max(1, ...data.map(d => d.value))
  const minV = Math.min(0, ...data.map(d => d.value))
  const range = maxV - minV || 1
  const yOf = (v) => padT + plotH * (1 - (v - minV) / range)
  const points = data.map((d, i) => {
    const xv = data.length === 1 ? padL + plotW / 2 : padL + plotW * i / (data.length - 1)
    const yv = yOf(d.value)
    const bw = data.length > 1 ? Math.min(40, plotW / data.length * 0.6) : 40
    return { name: d.name, label: String(d.value), x: xv, y: yv, bw, bx: xv - bw / 2 }
  })
  const gridY = []
  const ticks = 4
  for (let i = 0; i <= ticks; i++) gridY.push({ x1: padL, y1: padT + plotH * i / ticks, x2: W - padR, y2: padT + plotH * i / ticks })
  return {
    viewBox: `0 0 ${W} ${H}`,
    plotH, padT,
    axis: { x: padL, y1: padT, y2: padT + plotH, x2: W - padR },
    gridY, points
  }
})
const chartPoints = computed(() => chartSvg.value.points)
// ---------- 稿纸操作 ----------
// uniqueSheetName 已抽取到 src/core.js
function addSheet() {
  const base = `稿纸${sheets.value.length + 1}`
  sheets.value.push({ id: uid(), name: uniqueSheetName(base, sheets.value.map(s => s.name)), lines: [] })
  activeSheetIndex.value = sheets.value.length - 1
}
function switchSheet(idx) {
  activeSheetIndex.value = idx
  focusedLine.value = -1
  latestLineIdx.value = -1
  closeMenus()
  completion.value = null
  errPopover.value = { ...errPopover.value, show: false }
  varTip.value = { ...varTip.value, show: false }
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
  if (sheets.value.length <= 1) { toast('至少保留一份稿纸', { type: 'error' }); return }
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
const rateLoading = ref(false)
const rateCard = ref(null) // { rate, time, nextUpdate, source }
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
// 汇率数据源（免费、无需 key）：顺序尝试，第一个成功的即采用（容错切换）
async function getJson(url, timeout = 6000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) })
  if (!res.ok) throw new Error('fail')
  return res.json()
}
function pickCny(d) {
  const cny = d?.rates?.CNY
  if (!cny) throw new Error('no cny')
  return cny
}
const RATE_SOURCES = [
  {
    name: 'open.er-api.com',
    async get() {
      const d = await getJson('https://open.er-api.com/v6/latest/USD')
      return { rate: Number(pickCny(d)).toFixed(6), time: d.time_last_update_utc || '', nextUpdate: d.time_next_update_utc || '' }
    }
  },
  {
    name: 'ECB 欧洲央行',
    async get() {
      const d = await getJson('https://api.frankfurter.app/latest?from=USD&to=CNY')
      const cny = pickCny(d)
      // ECB 只给数据日期，用日期 + 次日推"更新时间/下次更新"
      const date = d.date ? new Date(d.date + 'T00:00:00Z') : null
      return {
        rate: Number(cny).toFixed(6),
        time: date ? date.toISOString() : '',
        nextUpdate: date ? new Date(date.getTime() + 24 * 3600 * 1000).toISOString() : ''
      }
    }
  },
  {
    name: 'exchangerate-api.com',
    async get() {
      const d = await getJson('https://api.exchangerate-api.com/v4/latest/USD')
      return { rate: Number(pickCny(d)).toFixed(6), time: d.time_last_update_utc || '', nextUpdate: d.time_next_update_utc || '' }
    }
  }
]
// 顺序尝试所有源，任一成功即返回 { source, rate, time, nextUpdate }；全部失败抛错
async function fetchRateSources() {
  for (const s of RATE_SOURCES) {
    try {
      const data = await s.get()
      return { source: s.name, ...data }
    } catch (e) { /* 换下一个源 */ }
  }
  throw new Error('all sources failed')
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
function fmtRateTime(s) {
  if (!s) return '—'
  try {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s
    return d.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZoneName: 'short'
    })
  } catch (e) { return s }
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
function toggleTheme() { theme.value = theme.value === 'light' ? 'dark' : 'light' }

// ---------- 全局快捷键 ----------
function onGlobalKeydown(e) {
  if (confirmState.value.show) {
    if (e.key === 'Escape') { e.preventDefault(); confirmCancel() }
    else if (e.key === 'Enter') { e.preventDefault(); confirmOk() }
    return
  }
  if (e.key === 'Escape') {
    if (varPanelOpen.value) { varPanelOpen.value = false; return }
    if (helpOpen.value) { helpOpen.value = false; return }
    if (rateCard.value) { closeRateCard(); return }
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
// 行内、行内浮层（复制菜单/错误浮层）上的点击不清除
function onDocClick(e) {
  if (e.target.closest('.calc-row, .popover')) return
  focusedLine.value = -1
  latestLineIdx.value = -1 // 底部添加行产生的"最新计算行"高亮也一并取消
}

// ---------- 持久化 ----------
// 存储失败告警标志：只提示一次，避免每次输入都弹错误打断用户
let storageWarned = false
function warnStorage(msg) {
  console.warn('[calc-paper] ' + msg)
  if (!storageWarned) {
    storageWarned = true
    toast('数据无法保存到本机，请检查浏览器存储设置', { type: 'error', duration: 3200 })
  }
}
function saveState() {
  const data = { sheets: sheets.value, activeSheetIndex: activeSheetIndex.value, theme: theme.value, paperStyle: paperStyle.value, decimalPlaces: decimalPlaces.value }
  try { localStorage.setItem('calc_paper_state', JSON.stringify(data)) }
  catch (e) { warnStorage('保存失败：' + e) }
}
function loadState() {
  try {
    const raw = localStorage.getItem('calc_paper_state')
    if (raw) return JSON.parse(raw)
  } catch (e) { console.warn('[calc-paper] 读取本地数据失败：', e) }
  return null
}
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveState() }, 400)
}
watch([sheets, activeSheetIndex, theme, paperStyle, decimalPlaces], scheduleSave, { deep: true })
// 小数位精度变化：全局重算，让已有结果实时刷新
watch(decimalPlaces, () => rebuildScope())

// ---------- 启动 ----------
// 同步加载本地数据：首帧即渲染真实数据（localStorage 读取是同步的）。
// 若放在 onMounted 异步执行，首帧先渲染默认空行、数据到达后再替换，
// transition-group 会把已有行当作"新插入"播放进入动画 → 刷新时整批行跳动闪烁。
const saved = loadState()
if (saved) {
  if (Array.isArray(saved.sheets) && saved.sheets.length) {
    sheets.value = saved.sheets.map(sh => ({
      id: sh.id || uid(),
      name: sh.name || '稿纸',
      lines: (sh.lines || []).map(l => ({
        id: l.id || uid(),
        expr: l.expr || '',
        result: l.result || '',
        note: l.note || '',
        time: l.time || (l.result ? nowTime() : ''),
        errorMsg: l.errorMsg || '',
        partial: !!l.partial,
        wasAssign: !!l.wasAssign,
        pulse: false,
        shake: false
      }))
    }))
  }
  if (typeof saved.activeSheetIndex === 'number') activeSheetIndex.value = saved.activeSheetIndex
  if (saved.theme === 'dark' || saved.theme === 'light') theme.value = saved.theme
  if (typeof saved.paperStyle === 'string' && ['white', 'ruled', 'grid', 'yellow', 'green'].includes(saved.paperStyle)) paperStyle.value = saved.paperStyle
  if (typeof saved.decimalPlaces === 'number' && Number.isInteger(saved.decimalPlaces) && saved.decimalPlaces >= 0 && saved.decimalPlaces <= 12) decimalPlaces.value = saved.decimalPlaces
}
// 顶层先重算一遍：首帧渲染的就是最终结果，避免挂载后再算导致行内容微变
rebuildScope()
onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('click', onDocClick)
  window.addEventListener('beforeunload', saveState)
  // 标签栏：竖向滚轮转横向滚动（非 passive，才能 preventDefault）
  if (sheetTabs.value) sheetTabs.value.addEventListener('wheel', onTabsWheel, { passive: false })
  // 初始化所有已存在行的 textarea 高度（兜底）
  nextTick(autosizeAllExpr)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('click', onDocClick)
  window.removeEventListener('beforeunload', saveState)
  if (sheetTabs.value) sheetTabs.value.removeEventListener('wheel', onTabsWheel)
  clearInterval(rateTimer)
  scrollTimers.forEach(t => clearTimeout(t))
  scrollTimers.clear()
  if (saveTimer) clearTimeout(saveTimer)
  if (toastTimer) clearTimeout(toastTimer)
  if (tipTimer) clearTimeout(tipTimer)
  if (copyFbTimer) clearTimeout(copyFbTimer)
  if (varTipTimer) clearTimeout(varTipTimer)
  Object.values(varTimers).forEach(t => clearTimeout(t))
})

// 变量值悬浮提示（算式中引用已定义变量时，hover 显示当前值）
const varTip = ref({ show: false, idx: -1, vars: [], pos: {} })
let varTipTimer = null
function showVarTip(lIdx, e) {
  const sh = currentSheet.value
  const vars = varScope
  const line = sh.lines[lIdx]
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
  const r = e.currentTarget.getBoundingClientRect()
  varTip.value = {
    show: true, idx: lIdx, vars: list,
    pos: { left: `${r.left}px`, top: `${r.bottom + 6}px` }
  }
}
function onExprHover(lIdx, e) {
  // 防抖：快速划过整列行时不重复跑正则+遍历
  if (varTipTimer) clearTimeout(varTipTimer)
  varTipTimer = setTimeout(() => { showVarTip(lIdx, e) }, 80)
}
function hideVarTip() {
  if (varTipTimer) { clearTimeout(varTipTimer); varTipTimer = null }
  varTip.value = { ...varTip.value, show: false }
}
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
  --radius: 10px;
  --radius-sm: 6px;
  --rule: rgba(0, 0, 0, 0.05);
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
  --rule: rgba(255, 255, 255, 0.06);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
/* 主题切换平滑：仅对主题色块容器做过渡，避免给全部元素强加过渡（既拖慢输入/hover 反馈，又增加样式计算开销） */
.app-wrapper, .app-card, .card-header, .sheet-bar, .paper-body, .card-footer,
.bottom-input, .calc-row, .sheet-tab, .sheet-add, .tool-btn, .modal-card,
.rate-card, .popover, .tooltip, .modal-btn, .icon-btn, .row-icon, .rename-input,
.help-table td, .guide-card, .result-block, .quick-input, .var-panel, .export-menu,
.exp-item, .chart-card, .chart-tabs button {
  transition: background-color .3s ease, color .3s ease, border-color .3s ease;
}
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
  position: relative;
  width: 100%; max-width: 1100px;
  /* 固定高度（类似一张纸），行少/空稿纸时不塌缩，内部滚动区负责内容伸缩 */
  height: min(88vh, 860px); max-height: 90vh;
  background: var(--card);
  border-radius: var(--radius);
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
.tab-icon { width: 22px; height: 22px; color: var(--text); display: flex; align-items: center; justify-content: center; }
.tab-icon svg { width: 100%; height: 100%; }
.tab-title { font-size: 14px; font-weight: 600; }
.version-tag {
  font-size: 11px; font-weight: 500; color: var(--text-secondary);
  background: var(--tab-bg); border: 1px solid var(--border);
  padding: 2px 7px; border-radius: 100px; white-space: nowrap;
}
.header-actions { display: flex; align-items: center; gap: 8px; }
.precision-control {
  display: flex; align-items: center; gap: 5px;
  height: 30px; padding: 0 10px 0 12px;
  background: var(--tab-bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 100px;
  font-size: 13px; font-weight: 500;
}
.precision-input {
  width: 28px; height: 22px; padding: 0 2px;
  border: none; border-radius: 4px;
  background: transparent; color: var(--text);
  font-size: 13px; font-weight: 600; text-align: center;
  outline: none;
  -moz-appearance: textfield;
}
.precision-input::-webkit-outer-spin-button,
.precision-input::-webkit-inner-spin-button {
  -webkit-appearance: none; margin: 0;
}
.precision-input:focus { background: var(--card); box-shadow: 0 0 0 2px var(--focus-ring); }
.precision-unit { font-size: 11px; color: var(--text-secondary); font-weight: 500; transform: scale(.92); }
.icon-btn {
  width: 32px; height: 32px; border: none; border-radius: 50%;
  background: var(--tool-bg); color: var(--text); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.icon-btn:hover { background: var(--tab-bg); }
.i-20 { width: 20px; height: 20px; }

/* 稿纸标签 */
.sheet-bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--card); }
.sheet-tabs { flex: 1; min-width: 0; display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; scroll-behavior: smooth; }
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
  display: flex; align-items: center; justify-content: center;
  opacity: 0.55; font-size: 10px; cursor: pointer; flex: 0 0 auto;
}
.sheet-edit:hover { opacity: 1; color: var(--accent); background: rgba(0, 113, 227, 0.12); }
.sheet-tab.editing { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus-ring); }
.sheet-del {
  width: 16px; height: 16px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  opacity: 0.55; font-size: 13px; font-weight: 700;
}
.sheet-del:hover { opacity: 1; background: rgba(255, 59, 48, 0.12); color: var(--error); }

/* 演算列表 */


.paper-wrap { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.paper-body { flex: 1; overflow-y: auto; padding: 10px 0 16px; scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: rgba(128,128,128,.45) transparent; overscroll-behavior: contain; }
/* 细滚动条常驻：避免溢出时滚动条"突然冒出"造成整体横移的卡顿感 */
.paper-body::-webkit-scrollbar { width: 8px; }
.paper-body::-webkit-scrollbar-track { background: transparent; }
.paper-body::-webkit-scrollbar-thumb { background: rgba(128,128,128,.45); border-radius: 4px; }
.paper-body::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,.7); }
/* 稿纸样式：横格 / 方格（白纸为默认纯色，无背景纹） */
.paper-body.paper-ruled {
  background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 31px, var(--rule) 31px, var(--rule) 32px);
  background-position: 0 10px;
}
.paper-body.paper-grid {
  background-image:
    repeating-linear-gradient(to right, transparent 0, transparent 31px, var(--rule) 31px, var(--rule) 32px),
    repeating-linear-gradient(to bottom, transparent 0, transparent 31px, var(--rule) 31px, var(--rule) 32px);
  background-position: 0 10px;
}
/* 彩色稿纸：黄色纸 / 护眼绿（背景染色，卡片改为半透明白，保留可读与卡片轮廓） */
.paper-body.paper-yellow { background-color: #fbf3d6; }
.paper-body.paper-green { background-color: #e3efe3; }
.paper-body.paper-yellow .calc-row,
.paper-body.paper-green .calc-row {
  background: rgba(255, 255, 255, 0.62);
  border-color: rgba(0, 0, 0, 0.06);
}
.paper-body.paper-yellow .calc-row:hover,
.paper-body.paper-green .calc-row:hover { background: rgba(255, 255, 255, 0.78); }
.calc-list { padding: 0 16px; position: relative; }

/* 空状态引导 */
.guide-card {
  margin: 24px 16px;
  padding: 28px 26px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
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

/* 空稿纸轻提示：非首次场景（新增稿纸/清空后），比首次引导卡更收敛 */
.empty-hint {
  margin: 22px 16px;
  padding: 22px 20px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  background: var(--row-hover);
  text-align: center;
}
.empty-hint-title { font-size: 14px; font-weight: 600; color: var(--muted); }
.empty-hint-sub { font-size: 12px; color: var(--muted); opacity: 0.85; margin: 6px 0 14px; line-height: 1.6; }

.calc-row {
  position: relative;
  background: var(--row-bg);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 8px;
  border: 1px solid var(--border);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 6px rgba(0, 0, 0, 0.03);
  transition: background-color .3s ease, border-color .3s ease, box-shadow .2s ease, opacity .2s ease;
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
/* 最新计算行：与 focused 区分，稳定指示"刚算完的那一行"，不受 blur 影响 */
.calc-row.latest {
  background: var(--focus-bg);
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--focus-ring), 0 6px 16px rgba(0, 113, 227, 0.10);
}
.calc-row.latest::before {
  content: '';
  position: absolute; left: -1px; top: 50%; transform: translateY(-50%);
  width: 4px; height: 64%; border-radius: 4px; background: var(--accent);
}
.calc-row.dragging { opacity: 0.45; }

/* 行内 grid 布局：算式独占整行（占满宽度），结果固定在第二行右下角，互不抢宽度 */
.row-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 6px 8px; /* 行距 6px，结果与算式留出呼吸间距 */
}
.drag-handle {
  cursor: grab; color: var(--muted); opacity: 0.5;
  font-size: 14px; letter-spacing: -2px; user-select: none;
  display: inline-flex; align-items: center;
  margin-right: 6px; vertical-align: middle;
}
.calc-row:hover .drag-handle { opacity: 0.8; }
.drag-handle:active { cursor: grabbing; }

.expr-wrap { position: relative; min-width: 0; }
/* 行内算式框与底部公式框共享的等宽 textarea 样式 */
.mono-textarea {
  box-sizing: border-box;
  border: none; background: transparent;
  font-size: 21px; font-weight: 600; color: var(--text);
  font-family: "SF Mono", SFMono-Regular, Consolas, monospace;
  resize: none; outline: none;
  line-height: 1.45;
  /* 高度统一由 JS autosizeExpr 控制：聚焦/失焦尺寸一致，避免 field-sizing 在移动端聚焦跳变 */
  max-height: 180px;
  overflow-y: auto;
}
.mono-textarea::placeholder { color: var(--muted); opacity: 0.7; }
.expr-input { display: block; width: 100%; padding: 4px 0; min-height: 32px; }

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
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  padding: 6px 12px; font-size: 13px; cursor: pointer;
}
.completion-name { font-family: "SF Mono", Consolas, monospace; font-weight: 600; }
.completion-desc { font-size: 12px; color: var(--muted); white-space: nowrap; }
.completion-item:hover, .completion-item.active { background: var(--focus-bg); }
.completion-item:hover .completion-name, .completion-item.active .completion-name { color: var(--accent); }

.result-block {
  grid-column: 1 / -1; grid-row: 2;
  justify-self: end; /* 第二行右下角 */
  max-width: 100%;
  display: flex; align-items: baseline; gap: 6px;
  font-family: "SF Mono", SFMono-Regular, Consolas, monospace;
  color: var(--result);
  white-space: normal; overflow-wrap: anywhere;
}
.result-block.empty { opacity: 0; }
.result-block.partial,
.result-block.error {
  background: rgba(255, 59, 48, 0.08);
  border: 1px solid rgba(255, 59, 48, 0.35);
  border-radius: var(--radius-sm);
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
  /* 长结果换行完整展示，不再单行截断 */
  overflow: visible; text-overflow: clip; white-space: normal;
  overflow-wrap: anywhere;
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
.row-meta-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
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
  padding: 13px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  color: var(--text);
  resize: none;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  /* 高度固定：min-height 必须能完整放下两行 placeholder；内容超出时直接截断，不显示滚动条 */
  min-height: 78px;
  max-height: 78px;
  overflow-y: hidden;
}
.quick-input::placeholder { color: var(--text); opacity: 0.4; }
.quick-input.q-focused {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--focus-ring);
}
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
.footer-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.tool-group { display: flex; gap: 6px; }
.tool-group-feat { padding-left: 12px; border-left: 1px solid var(--border); margin-left: 2px; }
.tool-btn {
  width: 34px; height: 34px; border-radius: 10px;
  border: none; background: var(--tool-bg); color: var(--text);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, transform 0.1s, color 0.15s, box-shadow 0.15s;
}
.tool-btn:not(:disabled):hover { background: var(--tab-bg); color: var(--accent); }
.tool-btn:not(:disabled):active { transform: scale(0.92); background: var(--accent); color: #fff; }
.tool-btn.tool-on { background: var(--accent); color: #fff; }
/* 撤销/重做栈为空时置灰；排除 rate-btn 以保留其加载中的 cursor: wait */
.tool-btn:disabled:not(.rate-btn) { opacity: 0.32; cursor: default; }
.i-18 { width: 18px; height: 18px; }
.i-16 { width: 16px; height: 16px; }
.i-22 { width: 22px; height: 22px; }

/* 导出下拉 */
.tool-export-wrap { position: relative; display: flex; }
.export-menu {
  position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%);
  background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.16); padding: 6px; min-width: 156px;
  display: flex; flex-direction: column; z-index: 95;
}
.exp-item {
  display: flex; align-items: center; gap: 10px;
  border: none; background: transparent; color: var(--text);
  text-align: left; padding: 9px 12px; border-radius: var(--radius-sm); cursor: pointer;
  font-size: 13px; transition: background 0.15s;
}
.exp-item:hover { background: var(--tab-bg); }
.exp-item svg { color: var(--accent); flex: 0 0 auto; }
/* 稿纸样式菜单：色块预览 */
.sw { width: 16px; height: 16px; border-radius: 4px; flex: 0 0 auto; border: 1px solid rgba(0, 0, 0, 0.12); }
.sw-white { background: #ffffff; }
.sw-ruled { background: #ffffff; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 4px, #d9dee6 4px, #d9dee6 5px); }
.sw-grid { background: #ffffff; background-image: repeating-linear-gradient(to right, transparent 0, transparent 4px, #d9dee6 4px, #d9dee6 5px), repeating-linear-gradient(to bottom, transparent 0, transparent 4px, #d9dee6 4px, #d9dee6 5px); }
.sw-yellow { background: #fbf3d6; }
.sw-green { background: #e3efe3; }

/* 标签栏末尾：新建稿纸（与标签同行，常规入口） */
.sheet-add {
  flex: 0 0 auto;
  width: 30px; height: 30px; border-radius: 50%;
  border: 1px dashed var(--border); background: transparent; color: var(--muted);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s, border-color 0.15s, transform 0.1s;
}
.sheet-add:hover { background: var(--tab-bg); color: var(--accent); border-color: var(--accent); }
.sheet-add:active { transform: scale(0.92); }
.pop-enter-active, .pop-leave-active { transition: opacity 0.16s, transform 0.16s; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateX(-50%) translateY(6px); }

/* 弹层菜单 */
.popover-mask { position: fixed; inset: 0; z-index: 80; }
.popover {
  position: fixed; z-index: 90;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.14);
  padding: 6px;
  min-width: 150px;
  display: flex; flex-direction: column;
}
.pop-item {
  border: none; background: transparent; color: var(--text);
  text-align: left; padding: 8px 12px; border-radius: var(--radius-sm);
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
  border-radius: var(--radius);
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
  display: flex; align-items: center; gap: 8px;
  color: #fff; padding: 10px 16px; border-radius: 100px;
  font-size: 13px; z-index: 99; backdrop-filter: blur(8px);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25);
  max-width: 80vw;
}
.toast.info { background: rgba(0, 0, 0, 0.82); }
.toast.success { background: rgba(52, 199, 89, 0.94); }
.toast.error { background: rgba(255, 59, 48, 0.94); }
.toast-icon { display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.toast-msg { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.toast-action {
  border: none; background: rgba(255, 255, 255, 0.22); color: #fff;
  padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 600;
  cursor: pointer; margin-left: 4px; flex: 0 0 auto;
}
.toast-action:hover { background: rgba(255, 255, 255, 0.34); }
.toast-slide-enter-active, .toast-slide-leave-active { transition: opacity .3s ease, transform .3s cubic-bezier(.22,1,.36,1); }
.toast-slide-enter-from, .toast-slide-leave-to { opacity: 0; transform: translate(-50%, 24px); }

/* 复制就地反馈 */
.copy-feedback {
  font-size: 12px; color: #34c759; font-weight: 600;
  display: inline-flex; align-items: center; gap: 3px;
  animation: fadeInUp .25s ease;
}
/* 错误徽标（可点击展开） */
.err-badge { cursor: pointer; user-select: none; }
.err-badge:hover { filter: brightness(1.06); }
/* 错误详情浮层 */
.err-popover { min-width: 260px; max-width: 320px; padding: 12px 14px; }
.err-title { font-size: 12px; font-weight: 700; color: var(--error); margin-bottom: 6px; letter-spacing: .5px; }
.err-reason { font-size: 13px; color: var(--text); line-height: 1.5; word-break: break-word; }
.err-suggest { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 13px; color: var(--muted); line-height: 1.6; }
.err-suggest-label {
  display: inline-block; font-size: 11px; font-weight: 700; color: var(--accent);
  background: var(--focus-bg); padding: 1px 7px; border-radius: 100px; margin-right: 6px;
}
/* 自定义 tooltip（带箭头，长文本自动折行并限制宽度，自动翻转） */
.tooltip {
  position: fixed; z-index: 200; transform: translateX(-50%);
  background: rgba(30, 33, 40, 0.94); color: #fff;
  padding: 7px 12px; border-radius: var(--radius-sm); font-size: 12px; line-height: 1.45;
  /* 最小宽度撑到内容自然宽度，防止被压成极窄条；最大宽度不超 220px 且留 8px 边距 */
  min-width: max-content;
  max-width: min(220px, calc(100vw - 16px));
  text-align: left; pointer-events: none;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
  overflow-wrap: anywhere; word-break: normal;
}
.tooltip.tooltip-top { transform: translateX(-50%) translateY(-100%); }
[data-theme="dark"] .tooltip { background: rgba(245, 245, 247, 0.95); color: #1d1d1f; }
/* 箭头挂在 tooltip 外侧，跟随按钮中心偏移，避免边缘时被挡住 */
.tooltip::after {
  content: ''; position: absolute; left: calc(50% + var(--arrow, 0px)); bottom: 100%;
  transform: translateX(-50%); margin-bottom: 6px;
  width: 0; height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: none;
  border-bottom: 8px solid rgba(30, 33, 40, 0.94);
}
.tooltip.tooltip-top::after {
  bottom: auto; top: 100%; margin-top: 6px; margin-bottom: 0;
  border-bottom-color: transparent;
  border-top: 8px solid rgba(30, 33, 40, 0.94);
}
[data-theme="dark"] .tooltip::after { border-bottom-color: rgba(245, 245, 247, 0.95); border-top-color: transparent; }
[data-theme="dark"] .tooltip.tooltip-top::after { border-top-color: rgba(245, 245, 247, 0.95); border-bottom-color: transparent; }
/* 汇率加载旋转 */
.spinner {
  width: 14px; height: 14px; display: inline-block;
  border: 2px solid var(--border); border-top-color: var(--accent);
  border-radius: 50%; animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

/* 汇率说明卡片 */
.rate-mask {
  position: fixed; left: 0; right: 0; bottom: 0; top: 0;
  background: rgba(0, 0, 0, 0.34); display: flex;
  align-items: center; justify-content: center; z-index: 120;
  backdrop-filter: blur(6px);
}
.rate-card {
  position: relative; width: min(380px, 92vw);
  background: var(--card); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: 22px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  animation: ratePop .3s cubic-bezier(.22, 1, .36, 1);
  overflow: hidden;
}
@keyframes ratePop {
  from { opacity: 0; transform: scale(.92) translateY(12px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.rate-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px;
}
.rate-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 14px; font-weight: 700; color: var(--text);
}
.rate-flag {
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; font-family: "SF Mono", Consolas, monospace;
}
.rate-close {
  width: 28px; height: 28px; border: none; border-radius: 50%;
  background: var(--focus-bg); color: var(--muted);
  font-size: 18px; line-height: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s, color .15s;
}
.rate-close:hover { background: var(--border); color: var(--text); }

.rate-hero {
  background: linear-gradient(180deg, var(--focus-bg) 0%, transparent 100%);
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: 18px; text-align: center; margin-bottom: 18px;
}
.rate-pair {
  font-size: 12px; font-weight: 600; color: var(--accent);
  letter-spacing: .6px; margin-bottom: 8px;
}
.rate-value { display: flex; align-items: baseline; justify-content: center; gap: 8px; flex-wrap: wrap; }
.rate-number {
  font-size: 34px; font-weight: 700; color: var(--accent);
  font-family: "SF Mono", Consolas, monospace; line-height: 1;
}
.rate-unit { font-size: 15px; color: var(--muted); }

.rate-meta {
  display: flex; flex-direction: column; gap: 12px;
  padding: 14px; background: var(--bg); border-radius: var(--radius);
  margin-bottom: 16px;
}
.rate-meta-row { display: flex; align-items: center; gap: 12px; }
.rate-meta-icon {
  width: 18px; height: 18px; flex: 0 0 18px; color: var(--muted);
}
.rate-meta-item { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.rate-meta-label { font-size: 12px; color: var(--muted); }
.rate-meta-value { font-size: 13px; color: var(--text); word-break: break-all; font-family: "SF Mono", Consolas, monospace; }

.rate-note {
  font-size: 12px; line-height: 1.65; color: var(--muted);
  margin-bottom: 16px; padding: 0 2px;
}

.rate-filled-hint {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin: -6px 0 16px;
  font-size: 12px; font-weight: 600; color: #34c759;
}
.rate-hint-icon { width: 14px; height: 14px; }

.rate-progress {
  position: absolute; top: 0; left: 0; height: 3px; width: 100%;
  background: var(--accent); border-radius: 18px 18px 0 0;
  transform-origin: left center; animation: rateShrink 5s linear forwards;
}
@keyframes rateShrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }

.rate-footer {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding-top: 16px; margin-top: 4px; border-top: 1px solid var(--border);
}
.rate-count {
  font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums;
}
.rate-btn-single {
  border: none; border-radius: var(--radius); padding: 9px 22px;
  background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
  transition: transform .1s, filter .15s;
}
.rate-btn-single:hover { filter: brightness(1.05); }
.rate-btn-single:active { transform: scale(.97); }

/* 行增删动画 */
/* 进入：只过渡合成属性（opacity/transform），高度立即就位，零重排；
   离开：行已 absolute 脱离文档流，保留 max-height 收缩动画不影响下方行重排 */
.row-enter-active { transition: opacity .35s cubic-bezier(.22,1,.36,1), transform .35s cubic-bezier(.22,1,.36,1); }
.row-leave-active { transition: all .35s cubic-bezier(.22,1,.36,1); overflow: hidden; }
.row-enter-from { opacity: 0; transform: translateY(14px) scale(.98); }
.row-leave-to { opacity: 0; transform: translateY(-8px) scale(.98); max-height: 0; margin-bottom: 0; padding-top: 0; padding-bottom: 0; }
/* 结果出现/变化动画 */
@keyframes resultPulse {
  0% { transform: scale(1); }
  30% { transform: scale(1.12); color: var(--accent); }
  100% { transform: scale(1); }
}
.calc-row.pulse .result-value { animation: resultPulse .65s ease; }
/* 错误行抖动 */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-5px); }
  40% { transform: translateX(5px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(3px); }
}
.calc-row.shake { animation: shake .5s ease; }
/* 拖拽插入指示线 */
.calc-row.drop-above::before, .calc-row.drop-below::after {
  content: ''; position: absolute; left: 14px; right: 14px; height: 2px;
  background: var(--accent); border-radius: 2px; z-index: 5;
}
.calc-row.drop-above::before { top: -5px; }
.calc-row.drop-below::after { bottom: -5px; }

/* 变量值悬浮提示 */
.var-tip {
  position: fixed; z-index: 150;
  background: var(--card); border: 1px solid var(--border);
  border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.14);
  padding: 6px 10px; min-width: 120px;
}
.var-tip-row { display: flex; align-items: baseline; gap: 6px; font-size: 13px; padding: 2px 0; }
.var-tip-name { font-family: "SF Mono", Consolas, monospace; font-weight: 600; color: var(--accent); }
.var-tip-eq { color: var(--muted); }
.var-tip-val { font-family: "SF Mono", Consolas, monospace; color: var(--text); }
.fade-enter-active, .fade-leave-active { transition: opacity .25s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* 响应式：H5 / 窄屏弹性布局 */
@media (max-width: 640px) {
  .app-wrapper { padding: 0; }
  .app-card {
    width: 100%; max-width: 100%;
    height: 100vh; height: 100dvh; max-height: none;
    border-radius: 0; box-shadow: none;
  }
  .card-header {
    padding: 10px 12px; gap: 8px;
    flex-wrap: wrap;
  }
  .title-tab { padding: 5px 8px 5px 6px; }
  .tab-title { font-size: 13px; }
  .version-tag { display: none; }
  .precision-label { display: none; }
  .precision-control { padding: 4px 8px; }
  .sheet-bar { padding: 8px 12px; }
  .sheet-name { max-width: 96px; }
  .card-footer { padding: 8px 12px; }
  .footer-tools { flex-wrap: wrap; gap: 8px; }
  .tool-group-feat { padding-left: 8px; }
  .bottom-input { padding: 10px 12px; }
  .calc-list { padding: 0 12px; }
  .calc-row { padding: 12px 12px; }
  .result-value { font-size: 20px; }
  .expr-input, .quick-input { font-size: 18px; }
  .row-main { gap: 4px 6px; }
  .result-block { grid-column: 1 / -1; }
  .quick-btn { width: 38px; height: 38px; }
}
@media (max-width: 380px) {
  .sheet-name { max-width: 72px; }
  .footer-tools { gap: 6px; }
  .tool-btn { width: 32px; height: 32px; }
  .tab-title { display: none; }
  .title-tab { padding: 4px; }
}

/* 变量面板遮罩 */
.var-mask {
  position: fixed; inset: 0; z-index: 95;
  background: rgba(0, 0, 0, 0.28);
  animation: var-mask-in .2s ease;
}
@keyframes var-mask-in { from { opacity: 0; } to { opacity: 1; } }

/* 变量面板（右侧滑入） */
.var-panel {
  position: absolute; top: 0; right: 0; bottom: 0; z-index: 96;
  width: 280px; max-width: 80%;
  background: var(--card); border-left: 1px solid var(--border);
  box-shadow: -12px 0 36px rgba(0, 0, 0, 0.12);
  display: flex; flex-direction: column;
}
.var-panel-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid var(--border);
}
.var-panel-title { font-size: 15px; font-weight: 600; color: var(--text); }
.var-panel-sub { display: block; font-size: 12px; color: var(--muted); margin-top: 3px; }
.var-panel-close {
  border: none; background: transparent; color: var(--muted);
  font-size: 20px; line-height: 1; cursor: pointer; padding: 2px 6px; border-radius: var(--radius-sm);
}
.var-panel-close:hover { background: var(--tab-bg); color: var(--text); }
.var-panel-body { padding: 12px 16px; overflow-y: auto; flex: 1; }
.var-panel-hint { font-size: 13px; line-height: 1.7; color: var(--muted); }
.var-panel-hint code { background: var(--tab-bg); border-radius: 4px; padding: 1px 6px; font-family: "SF Mono", Consolas, monospace; }
.var-row {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 10px; border-radius: 10px; background: var(--input-bg);
  margin-bottom: 8px;
}
.var-name { font-family: "SF Mono", Consolas, monospace; font-weight: 600; color: var(--text); }
.var-eq { color: var(--muted); }
.var-val { flex: 1; font-family: "SF Mono", Consolas, monospace; color: var(--text); word-break: break-all; }
.var-copy {
  border: none; background: transparent; color: var(--muted);
  cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 6px; flex: 0 0 auto;
}
.var-copy:hover { background: var(--tab-bg); color: var(--accent); }
.var-input {
  flex: 1; min-width: 0;
  border: 1px solid var(--border); background: var(--card); color: var(--text);
  font-family: "SF Mono", Consolas, monospace; font-size: 13px;
  padding: 6px 8px; border-radius: var(--radius-sm); outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.var-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--focus-ring); }
.style-menu .exp-item.active { color: var(--accent); background: var(--focus-bg); font-weight: 600; }
.slide-right-enter-active, .slide-right-leave-active { transition: transform .26s ease; }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); }

/* 简易图表弹窗 */
.chart-card { width: min(640px, 94vw); }
.chart-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.chart-title { font-size: 16px; font-weight: 600; color: var(--text); }
.chart-tabs { display: flex; gap: 4px; margin-left: auto; background: var(--tab-bg); padding: 3px; border-radius: 10px; }
.chart-tabs button {
  border: none; background: transparent; color: var(--text); cursor: pointer;
  font-size: 13px; padding: 6px 12px; border-radius: var(--radius-sm); transition: background 0.15s, color 0.15s;
}
.chart-tabs button.active { background: var(--card); color: var(--accent); box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
.chart-close {
  border: none; background: transparent; color: var(--muted);
  font-size: 20px; line-height: 1; cursor: pointer; padding: 2px 6px; border-radius: var(--radius-sm);
}
.chart-close:hover { background: var(--tab-bg); color: var(--text); }
.chart-input-row { margin-bottom: 12px; }
.chart-input {
  width: 100%; resize: none; border: 1px solid var(--border); border-radius: 10px;
  background: var(--input-bg); color: var(--text);
  padding: 10px 12px; font-size: 14px; outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.chart-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--focus-ring); }
.chart-canvas {
  background: var(--input-bg); border-radius: var(--radius); padding: 10px;
  display: flex; align-items: center; justify-content: center; min-height: 280px;
}
.chart-svg { width: 100%; height: auto; }
.chart-grid { stroke: var(--border); stroke-width: 1; }
.chart-axis { stroke: var(--muted); stroke-width: 1.5; }
.chart-bar { fill: var(--accent); opacity: 0.88; transition: opacity 0.15s; }
.chart-bar:hover { opacity: 1; }
.chart-line { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.chart-dot { fill: var(--accent); }
.chart-val { fill: var(--text); font-size: 11px; text-anchor: middle; font-family: "SF Mono", Consolas, monospace; }
.chart-xlabel { fill: var(--muted); font-size: 11px; text-anchor: middle; }
.chart-empty { color: var(--muted); font-size: 14px; }
</style>
