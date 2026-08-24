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
            <span v-if="editingIndex !== sIdx" class="sheet-edit" v-tip="'重命名（双击标签也可）'" @click.stop="startRename(sIdx)">✎</span>
            <span v-if="sheets.length > 1 && editingIndex !== sIdx" class="sheet-del" v-tip="'删除此稿纸'" @click.stop="delSheet(sIdx)">×</span>
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
            <div class="guide-example">· 快捷键：<code>Ctrl+Z</code> 撤销 · <code>Tab</code> 算式⇄备注 · <code>↑</code> 调历史 / 再按选行</div>
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

        <transition-group name="row" tag="div" class="calc-list">
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
              <div class="result-block" :class="{ error: line.result === '错误', partial: line.partial, empty: !line.expr.trim() && !line.result }" v-tip="line.expr.trim() ? '算式：' + line.expr : null">
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

      <!-- 底部新增输入区 -->
      <div class="bottom-input">
        <div class="input-row">
          <textarea
            ref="bottomInput"
            v-model="quickExpr"
            @input="onQuickInput"
            @keydown.enter.prevent="addFromBottom"
            @keydown.up.prevent="bottomUp"
            class="quick-input mono-textarea"
            rows="1"
            placeholder="计算公式（支持粘贴多行，↑ 调历史，再↑ 选行）"
            spellcheck="false"
          ></textarea>
          <button class="quick-btn" @click="addFromBottom" v-tip="'新增一行'">=</button>
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
            <button class="tool-btn rate-btn" @click="fetchRateToInput" :disabled="rateLoading" v-tip="'获取 USD→CNY 参考汇率，点开可看详情并填入公式'">
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
            <button class="tool-btn" @click="undo" v-tip="'撤销（Ctrl+Z）'">
              <svg class="i-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
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
        </div>

        <button class="btn-new-sheet" @click="addSheet">
          <span class="plus">+</span>
          <span>新稿纸</span>
        </button>
      </footer>
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

    <!-- 自定义 tooltip（带箭头，延迟 300ms） -->
    <transition name="fade">
      <div v-if="tipState.show" class="tooltip" :style="{ left: tipState.x + 'px', top: tipState.y + 'px' }">{{ tipState.text }}</div>
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
                <tr><td>拖动 <code>⋮⋮</code></td><td>调整算式行的顺序</td></tr>
                <tr><td>标签 ✎ / 双击标签</td><td>重命名稿纸（回车确认，Esc 取消）</td></tr>
                              </tbody>
              </table>
            </div>

            <!-- 数据 -->
            <div class="help-section">
              <div class="help-head">⑥ 数据安全</div>
              <div class="help-grid">
                所有数据自动保存在本机浏览器，关闭页面不丢失。
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

// 新建一行数据的工厂（统一默认字段，避免各处手写字面量不一致）
function newLine() {
  return { id: uid(), expr: '', result: '', note: '', time: '', errorMsg: '', partial: false }
}

// ---------- 数据 ----------
// 稿纸默认 0 行（不预留空行），所有行由用户操作（底部回车/载入示例等）产生
const sheets = ref([
  { id: uid(), name: '稿纸1', vars: {}, lines: [] }
])
const activeSheetIndex = ref(0)
const theme = ref('light')
const currentSheet = computed(() => sheets.value[activeSheetIndex.value])
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
let toastTimer = null
let saveTimer = null

// 自定义 tooltip（带箭头，延迟 300ms，替换原生 title）
const tipState = ref({ show: false, text: '', x: 0, y: 0 })
let tipTimer = null
function hideTip() {
  clearTimeout(tipTimer)
  tipState.value = { ...tipState.value, show: false }
}
const vTip = {
  mounted(el, binding) {
    const getText = () => typeof binding.value === 'function' ? binding.value() : binding.value
    const onEnter = () => {
      tipTimer = setTimeout(() => {
        const r = el.getBoundingClientRect()
        let x = r.left + r.width / 2
        const pad = 8
        const half = 110 // max-width 220 / 2
        x = Math.max(half + pad, Math.min(x, window.innerWidth - half - pad))
        tipState.value = { show: true, text: getText(), x, y: r.bottom + 6 }
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
try { _guideInit = !localStorage.getItem('calc_paper_guide_dismissed') } catch (e) {}
const guideOpen = ref(_guideInit)
function dismissGuide() {
  guideOpen.value = false
  try { localStorage.setItem('calc_paper_guide_dismissed', '1') } catch (e) {}
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
  rebuildSheetScope(currentSheet.value)
  dismissGuide()
  toast('已载入示例', { type: 'success' })
}

// 帮助
const helpOpen = ref(false)

// 撤销栈（恢复完整 UI 状态：稿纸数据 + 底部输入框内容 + 当前焦点行 + 最新计算行）
const undoStack = ref([])
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
function pushUndo() {
  try {
    const snap = JSON.stringify(snapshot())
    if (snap.length > MAX_SNAP_SIZE) return
    undoStack.value.push(snap)
    if (undoStack.value.length > MAX_UNDO) undoStack.value.shift()
  } catch (e) {}
}
function undo() {
  if (!undoStack.value.length) { toast('没有可撤销的操作'); return }
  applySnapshot(JSON.parse(undoStack.value.pop()))
  toast('已撤销')
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
// 去掉数字字符串尾部的无效 0（含科学计数法小数部分）
const TRAILING_ZEROS = /(\.\d*?)0+$/
function trimZeros(s) {
  if (s.includes('e')) {
    const [m, exp] = s.split('e')
    return m.replace(TRAILING_ZEROS, '$1').replace(/\.$/, '') + 'e' + exp
  }
  return s.replace(TRAILING_ZEROS, '$1').replace(/\.$/, '')
}

function formatResult(res) {
  if (res === undefined || res === null) return ''
  try {
    if (math.isBigNumber(res)) {
      // 整数：完整输出（不转科学计数法，不丢位）
      if (res.isInteger()) return res.toFixed(0)
      // 完整十进制（decimal.js 64 位有效数字，有限小数可精确表示）
      const full = res.toString()
      // 小数部分 > 12 位：商业精度截断到 12 位（数学上必然截断，远超日常精度需求；避免 1/3 输出 64 位字符挤爆 UI）
      const decIdx = full.indexOf('.')
      if (decIdx >= 0 && full.length - decIdx - 1 > 12) {
        const f = trimZeros(math.format(res, { notation: 'fixed', precision: 12 }))
        // fixed 变成 0（极小值）时保留指数形式，避免误显示为 0
        if (f === '0' || f === '-0') return full
        return f
      }
      // 有限且长度适中 → 完整显示，零偏差
      if (!full.includes('e') && full.length <= 32) return trimZeros(full)
      // 罕见大数（>32 位整数部分）：用指数形式
      return trimZeros(math.format(res, { notation: 'exponential', precision: 12 }))
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

function suggestFix(msg) {
  if (/未定义符号/.test(msg)) {
    const m = msg.match(/：(\S+)/)
    const sym = m ? m[1].replace(/（.*/, '') : ''
    return `检查拼写，或先定义变量（如 ${sym || 'x'} = 0）。若是函数，可尝试 sqrt( abs( round( 等。`
  }
  if (/未定义函数/.test(msg)) return '检查函数名拼写，可用：sqrt abs round floor ceil min max sum sin cos tan exp log log10 factorial'
  if (/缺少右括号/.test(msg)) return '在表达式末尾补上一个 )'
  if (/不完整/.test(msg)) return '在运算符后补上数值，或删除多余的运算符'
  if (/缺少数值/.test(msg)) return '运算符（如 + - * /）后面需要跟一个数值或括号'
  if (/除以零/.test(msg)) return '检查分母是否为 0，或先定义分母变量再计算'
  if (/赋值错误/.test(msg)) return '等号左侧必须是变量名，例如 tax = 0.13'
  if (/参数/.test(msg)) return '函数需要正确的参数个数，例如 sqrt(9)'
  if (/无效字符/.test(msg)) return '表达式包含不支持的字符，请删除或替换'
  if (/数字格式/.test(msg)) return '数字写法有误，例如 1.2.3 或带逗号 1,000 不合法'
  return '请检查表达式语法后重试'
}

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

function safeEval(expr, scope) {
  try { return { ok: true, value: formatResult(math.evaluate(expr, scope)) } }
  catch (e) { return { ok: false, error: e } }
}

function computeLine(line, scope, animate = true) {
  if (line.pulse === undefined) line.pulse = false
  if (line.shake === undefined) line.shake = false
  const prevResult = line.result
  const prevError = prevResult === '错误'
  const trimmed = line.expr.trim()
  if (!trimmed) {
    line.result = ''; line.partial = false; line.errorMsg = ''
    applyAnim(line, prevResult, prevError, animate); return
  }
  // 只要行内有内容（无论对错）就标记首次尝试时间；空行不标记
  if (!line.time) line.time = nowTime()
  const full = safeEval(trimmed, scope)
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
      const p = safeEval(attempt, scope)
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

function rebuildSheetScope(sh) {
  sh.vars = {}
  for (const ln of sh.lines) computeLine(ln, sh.vars, false)
}
function rebuildScope() {
  for (const sh of sheets.value) rebuildSheetScope(sh)
}

function onExprInput(idx) {
  const sh = currentSheet.value
  if (!sh.vars) sh.vars = {}
  const varsBefore = JSON.stringify(sh.vars)
  computeLine(sh.lines[idx], sh.vars)
  // 级联重算：仅当本次编辑改变了变量（赋值行增删/改值）才重算后续行；
  // 普通算式行编辑不触发，避免每敲一键 O(n) 全量重算
  if (JSON.stringify(sh.vars) !== varsBefore) {
    for (let i = idx + 1; i < sh.lines.length; i++) {
      computeLine(sh.lines[i], sh.vars, false)
    }
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
  if (!sh.vars) sh.vars = {}
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
  computeLine(sh.lines[idx], sh.vars)
  // 后续行：第二行起每行一个新行，最后一行带 after
  for (let i = 1; i < lines.length; i++) {
    const isLast = i === lines.length - 1
    const expr = lines[i] + (isLast ? after : '')
    const line = { ...newLine(), expr }
    sh.lines.splice(idx + newRows.length + 1, 0, line)
    newRows.push(line)
    computeLine(line, sh.vars)
  }
  rebuildSheetScope(sh)
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

// 自适应 textarea 高度（不支持 CSS field-sizing 的浏览器兜底；支持的浏览器交给 CSS，避免双机制冲突）
const FIELD_SIZING_SUPPORTED = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing', 'content')
function autosizeExpr(el) {
  if (!el || FIELD_SIZING_SUPPORTED) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
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
// 行的进入动画约 350ms（max-height 从 0 展开），必须等它结束后再滚，否则布局未稳定会差一点；
// 这里手动计算目标 scrollTop：让行底边比可视区底边高 GAP 像素（留呼吸间距），而不是死板对齐容器底边。
function locateRow(id) {
  const container = paperBody.value
  if (!container) return
  const GAP = 12
  const targetTop = () => {
    const el = id != null ? rowRefs[id] : null
    if (el) {
      const rowRect = el.getBoundingClientRect()
      const cRect = container.getBoundingClientRect()
      // row 底边相对于容器内容区顶部的位置
      const rowBottom = rowRect.bottom - cRect.top + container.scrollTop
      return Math.max(0, rowBottom + GAP - container.clientHeight)
    }
    return Math.max(0, container.scrollHeight - container.clientHeight)
  }
  const goBottom = () => {
    const t = targetTop()
    container.scrollTo({ top: t, behavior: 'smooth' })
    // 平滑滚动结束后再算一次目标位置；若仍差一点，瞬时强制到位
    laterScroll(() => {
      const t2 = targetTop()
      if (container.scrollTop < t2 - 1) {
        container.scrollTo({ top: t2, behavior: 'auto' })
      }
    }, 480)
  }
  // 等进入动画（约 350ms）结束后再开始滚动定位
  laterScroll(goBottom, 420)
}

// 行内输入框获得焦点：高亮当前行，并取消"最新计算行"高亮，避免两个高亮并存
function onRowFocus(idx) {
  focusedLine.value = idx
  if (idx !== latestLineIdx.value) latestLineIdx.value = -1
  ensureRowVisible(idx)
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
  if (!sh.vars) sh.vars = {}
  computeLine(sh.lines[lIdx], sh.vars) // 补全后立即重算，避免结果停留旧值
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
  rebuildSheetScope(currentSheet.value)
  toast(isLast ? '已清空该行' : '已删除该行', { type: 'success', action: { label: '撤销', run: undo } })
}

function addFromBottom() {
  const parts = quickExpr.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  if (!parts.length) { bottomInput.value?.focus({ preventScroll: true }); return }
  pushUndo() // 新增行可撤销（Ctrl+Z 或 toast）
  const sh = currentSheet.value
  if (!sh.vars) sh.vars = {}
  let lastId = null
  for (const p of parts) {
    const line = { ...newLine(), expr: p }
    sh.lines.push(line)
    computeLine(line, sh.vars)
    lastId = line.id
  }
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
  rebuildSheetScope(currentSheet.value)
  resetDrag()
  toast('已调整顺序', { type: 'success', action: { label: '撤销', run: undo } })
}
function onDragEnd() { resetDrag() }
function resetDrag() { dragState.value = { from: -1, to: -1, pos: 'below' } }

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
// ---------- 稿纸操作 ----------
function uniqueSheetName(base) {
  const used = new Set(sheets.value.map(s => s.name))
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base} (${n})`)) n++
  return `${base} (${n})`
}
function addSheet() {
  const base = `稿纸${sheets.value.length + 1}`
  sheets.value.push({ id: uid(), name: uniqueSheetName(base), vars: {}, lines: [] })
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
  currentSheet.value.vars = {}
  focusedLine.value = -1
  latestLineIdx.value = -1
  toast('已清空当前稿纸', { type: 'success', action: { label: '撤销', run: undo } })
}
async function clearAllSheets() {
  const ok = await askConfirm('确定清空所有稿纸？清空后可通过撤销恢复。')
  if (!ok) return
  pushUndo()
  sheets.value = [{ id: uid(), name: '稿纸1', vars: {}, lines: [] }]
  activeSheetIndex.value = 0
  focusedLine.value = -1
  latestLineIdx.value = -1
  toast('已清空所有稿纸', { type: 'success', action: { label: '撤销', run: undo } })
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
    if (helpOpen.value) { helpOpen.value = false; return }
    if (rateCard.value) { closeRateCard(); return }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    e.preventDefault()
    undo()
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
function saveState() {
  const data = { sheets: sheets.value, activeSheetIndex: activeSheetIndex.value, theme: theme.value }
  try { localStorage.setItem('calc_paper_state', JSON.stringify(data)) } catch (e) {}
}
function loadState() {
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
// 同步加载本地数据：首帧即渲染真实数据（localStorage 读取是同步的）。
// 若放在 onMounted 异步执行，首帧先渲染默认空行、数据到达后再替换，
// transition-group 会把已有行当作"新插入"播放进入动画 → 刷新时整批行跳动闪烁。
const saved = loadState()
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
        partial: !!l.partial,
        pulse: false,
        shake: false
      }))
    }))
  }
  if (typeof saved.activeSheetIndex === 'number') activeSheetIndex.value = saved.activeSheetIndex
  if (saved.theme === 'dark' || saved.theme === 'light') theme.value = saved.theme
}
// 顶层先重算一遍：首帧渲染的就是最终结果，避免挂载后再算导致行内容微变
rebuildScope()
onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('click', onDocClick)
  window.addEventListener('beforeunload', saveState)
  // 初始化所有已存在行的 textarea 高度（兜底）
  nextTick(autosizeAllExpr)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('click', onDocClick)
  window.removeEventListener('beforeunload', saveState)
  clearInterval(rateTimer)
  scrollTimers.forEach(t => clearTimeout(t))
  scrollTimers.clear()
  if (saveTimer) clearTimeout(saveTimer)
  if (toastTimer) clearTimeout(toastTimer)
})

// 变量值悬浮提示（算式中引用已定义变量时，hover 显示当前值）
const varTip = ref({ show: false, idx: -1, vars: [], pos: {} })
let varTipTimer = null
function showVarTip(lIdx, e) {
  const sh = currentSheet.value
  const vars = sh.vars || {}
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
/* 主题切换平滑：仅对主题色块容器做过渡，避免给全部元素强加过渡（既拖慢输入/hover 反馈，又增加样式计算开销） */
.app-wrapper, .app-card, .card-header, .sheet-bar, .paper-body, .card-footer,
.bottom-input, .calc-row, .sheet-tab, .tool-btn, .btn-new-sheet, .modal-card,
.rate-card, .popover, .tooltip, .modal-btn, .icon-btn, .row-icon, .rename-input,
.help-table td, .guide-card, .result-block {
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
  width: 100%; max-width: 1100px;
  /* 固定高度（类似一张纸），行少/空稿纸时不塌缩，内部滚动区负责内容伸缩 */
  height: min(88vh, 860px); max-height: 90vh;
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
.calc-list { padding: 0 16px; position: relative; }

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

/* 空稿纸轻提示：非首次场景（新增稿纸/清空后），比首次引导卡更收敛 */
.empty-hint {
  margin: 22px 16px;
  padding: 22px 20px;
  border: 1px dashed var(--border);
  border-radius: 14px;
  background: var(--row-hover);
  text-align: center;
}
.empty-hint-title { font-size: 14px; font-weight: 600; color: var(--muted); }
.empty-hint-sub { font-size: 12px; color: var(--muted); opacity: 0.85; margin: 6px 0 14px; line-height: 1.6; }

.calc-row {
  position: relative;
  background: var(--row-bg);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 8px;
  border: 1px solid transparent;
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
  border: none; background: transparent;
  font-size: 21px; font-weight: 600; color: var(--text);
  font-family: "SF Mono", SFMono-Regular, Consolas, monospace;
  resize: none; outline: none;
  line-height: 1.45;
  /* 自动按内容高度（现代浏览器 Chrome 124+/Safari 18+）；旧浏览器由 JS autosizeExpr 兜底 */
  field-sizing: content;
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
  padding: 8px 0;
  /* 高度随内容增长（默认约 2 行，达上限才出现内部滚动） */
  min-height: 56px;
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
/* 自定义 tooltip（带箭头，长文本自动折行并限制宽度） */
.tooltip {
  position: fixed; z-index: 200; transform: translateX(-50%);
  background: rgba(30, 33, 40, 0.94); color: #fff;
  padding: 7px 12px; border-radius: 8px; font-size: 12px; line-height: 1.45;
  max-width: 220px; text-align: left; pointer-events: none;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
  overflow-wrap: break-word; word-break: break-word;
}
[data-theme="dark"] .tooltip { background: rgba(245, 245, 247, 0.95); color: #1d1d1f; }
.tooltip::after {
  content: ''; position: absolute; left: 50%; top: -5px; transform: translateX(-50%);
  border-left: 5px solid transparent; border-right: 5px solid transparent;
  border-bottom: 5px solid rgba(30, 33, 40, 0.94);
}
[data-theme="dark"] .tooltip::after { border-bottom-color: rgba(245, 245, 247, 0.95); }
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
  border: 1px solid var(--border); border-radius: 20px;
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
  border: 1px solid var(--border); border-radius: 16px;
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
  padding: 14px; background: var(--bg); border-radius: 14px;
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
  border: none; border-radius: 12px; padding: 9px 22px;
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
.row-leave-active { position: absolute; left: 16px; right: 16px; margin-bottom: 0; }
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

/* 响应式 */
@media (max-width: 640px) {
  .app-wrapper { padding: 12px; }
  .app-card { height: min(92vh, 720px); max-height: 95vh; border-radius: 18px; }
  .result-value { font-size: 20px; }
  .expr-input, .quick-input { font-size: 18px; }
  .row-main { gap: 4px 6px; }
  .result-block { grid-column: 1 / -1; }
}
</style>
