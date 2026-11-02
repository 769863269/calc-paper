<template>
  <!-- 帮助弹层：纯展示内容，无内部状态，开关由父组件控制 -->
  <transition name="fade">
    <div v-if="open" class="modal-mask" @click.self="$emit('close')">
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
              <tr><td><code>↑</code>（底部输入框）</td><td>三级阶梯：上一个计算结果 → 上一个计算公式 → 选行编辑；<code>Esc</code> 退回空框</td></tr>
              <tr><td><code>Ctrl+Z</code></td><td>撤销删除 / 清空（最多 50 步）</td></tr>
              <tr><td><code>Ctrl+Y</code> / <code>Ctrl+Shift+Z</code></td><td>重做（撤销后反悔，恢复被撤销的那一步）</td></tr>
              <tr><td>拖动 <code>⋮⋮</code></td><td>调整算式行的顺序</td></tr>
              <tr><td>右键行</td><td>上移 / 下移、插入空行、复制（结果·算式·整行）、清空、删除</td></tr>
              <tr><td>双击结果数字</td><td>直接复制该行结果（未格式化的原始值，方便粘贴到别处继续算）</td></tr>
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
          <button class="modal-btn primary" @click="$emit('close')">知道了</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
defineProps({ open: { type: Boolean, default: false } })
defineEmits(['close'])
</script>
