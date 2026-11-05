/**
 * BOSS DOM 样本。
 *
 * - listPageHtml：结构按 2026-11-05 真实 /web/geek/jobs 页面诊断快照还原（文字已替换/精简）。
 *   干扰字隐藏方式已由真实快照确认（visibility:hidden / display:none）。
 * - detailPageHtml：结构按 2026-11-05 真实 /job_detail/ 页面快照还原。
 * - 原始快照保存在 tests/fixtures/real/（含页面真实文字，提交前请自行决定是否脱敏）。
 */

export const LIST_URL = 'https://www.zhipin.com/web/geek/jobs?query=开发&city=101280600';
export const DETAIL_URL = 'https://www.zhipin.com/job_detail/abc123XYZ~.html';

/** 隐藏干扰字使用的随机 class（模拟）。 */
// 2026-11-05 真实快照确认：干扰字以 visibility:hidden 为主，个别为 display:none
const DECOY_STYLE = '<style>.NbiWQRac{visibility:hidden}.CJYxDSctbzt{display:none}</style>';

export const DEFAULT_DESC =
  '岗<span class="zsWHyxM">位</span>职责\n' +
  '1、负责主流AI大模型的场景化应⽤<span class="NbiWQRac">boss</span>调<span class="CJYxDSctbzt">直聘</span>试、指令优化；\n' +
  '2、根据业务需求，微调模型输出效果。\n' +
  '\n' +
  '任职要求\n' +
  '1、熟悉 Python；\n' +
  '2、有大模型应用经验优先。';

export function listPageHtml(opts: {
  jobId?: string;
  title?: string;
  company?: string;
  salary?: string;
  city?: string;
  description?: string;
  bossOnline?: string;
  /** 模拟点击新卡片后、面板尚未刷新时：左侧 active 卡片与右侧面板不一致 */
  activeCardJobId?: string;
}): string {
  const {
    jobId = '18963a44fd12044c0nx_09-6GFVQ',
    title = 'Ai应用工程师（大模型/视觉方向）',
    company = '东莞某某贸易有限公司',
    salary = '12-20K·14薪',
    city = '东莞',
    description = DEFAULT_DESC,
    bossOnline = '在线',
    activeCardJobId = jobId,
  } = opts;
  return `${DECOY_STYLE}
  <div id="wrap" class="page-jobs has-header page-header-v2">
    <div class="job-recommend-main">
      <div class="recommend-result-job clearfix">
        <div class="job-list-container">
          <ul class="rec-job-list">
            <div class="card-area is-seen">
              <div class="job-card-wrap active">
                <li class="job-card-box">
                  <div class="job-info">
                    <div class="job-title clearfix">
                      <a class="job-name" href="/job_detail/${activeCardJobId}.html">${title}</a>
                      <span class="job-salary">${salary}</span>
                    </div>
                    <ul class="tag-list"><li>1年以内</li><li>大专</li></ul>
                  </div>
                  <div class="job-card-footer">
                    <a class="boss-info" href="/gongsi/xxx.html"><span class="boss-name">${company}</span></a>
                    <span class="company-location">${city}·万江街道·某商圈</span>
                  </div>
                </li>
              </div>
            </div>
            <div class="card-area">
              <div class="job-card-wrap">
                <li class="job-card-box">
                  <div class="job-info"><div class="job-title clearfix">
                    <a class="job-name" href="/job_detail/0093a6e4ca254de70nV72Nm0GFJS.html">招厚街店服务员</a>
                    <span class="job-salary">4-6K</span>
                  </div></div>
                  <div class="job-card-footer"><a class="boss-info"><span class="boss-name">某比萨</span></a></div>
                </li>
              </div>
            </div>
          </ul>
        </div>
        <div class="job-detail-container">
          <div class="job-detail-box">
            <div class="job-detail-header">
              <div class="job-header-info">
                <div class="job-detail-info">
                  <span class="job-name">${title}</span>
                  <span class="job-salary">${salary}</span>
                </div>
                <ul class="tag-list">
                  <li><a href="/c101281600/">${city}</a></li>
                  <li><span>1年以内</span></li>
                  <li><span>大专</span></li>
                </ul>
              </div>
              <div class="job-detail-op clearfix">
                <a class="op-btn op-btn-like">收藏</a><a class="op-btn op-btn-chat">立即沟通</a>
              </div>
            </div>
            <div class="job-detail-body">
              <div class="job-detail-operate"><a class="link-report-new">举报</a></div>
              <h3 class="title">职位描述</h3>
              <p class="desc" style="white-space: pre-wrap">${description}</p>
              <div class="job-boss-info">
                <div><h2 class="name">某HR<span class="boss-online-tag">${bossOnline}</span></h2>
                <div class="boss-info-attr">${company} · HR</div></div>
                <div class="job-search-scan">去App与BOSS随时沟通</div>
              </div>
              <div class="job-address">
                <span class="job-address-title">工作地址</span>
                <p class="job-address-desc">东莞某商会大厦19楼</p>
              </div>
              <a class="more-job-btn" href="/job_detail/${jobId}.html">查看更多信息</a>
            </div>
          </div>
          <div class="c-job-tools job-tools"><div class="desc">尊享8大特权提升求职效率</div></div>
        </div>
      </div>
    </div>
    <div class="chat-box">HR：你好，请问还在看机会吗？</div>
  </div>`;
}

/** 按 2026-11-05 真实 /job_detail/ 页面诊断快照还原（文字已替换/精简）。 */
export function detailPageHtml(): string {
  return `${DECOY_STYLE}
  <div id="main">
    <div class="job-banner"><div class="inner home-inner"><div class="job-primary detail-box">
      <div class="info-primary">
        <div class="job-status"><span>招聘中</span></div>
        <div class="name"><h1>后端开发工程师</h1><span class="salary">20-30K</span></div>
        <p><a class="text-desc text-city" href="/shanghai/">上海</a><span class="text-desc text-experiece">1-3年</span><span class="text-desc text-degree">本科</span></p>
        <div class="job-op"><a class="btn btn-startchat">立即沟通</a></div>
      </div>
    </div></div></div>
    <div class="smallbanner"><div class="company-info"><div class="name"><span class="job-title">后端开发工程师</span></div></div></div>
    <div class="job-box"><div class="inner home-inner">
      <div class="job-sider">
        <div class="sider-company"><p>公司基本信息</p>
          <div class="company-info">
            <a ka="job-detail-company-logo_custompage" href="/gongsi/x.html"><img></a>
            <a ka="job-detail-company_custompage" href="/gongsi/x.html">某智能公司</a>
          </div>
        </div>
        <div class="similar-job"><span class="similar-job-name">其他相似职位</span><span class="company-name">别家公司</span></div>
      </div>
      <div class="job-detail">
        <div class="job-detail-section">
          <div class="detail-section-operate"><a class="link-report">举报<span class="CJYxDSctbzt">kanzhun</span></a></div>
          <div class="detail-content-header"><h3>职位描述<span class="NbiWQRac">kanzhun</span></h3></div>
          <ul class="job-keyword-list"><li>Python<span class="NbiWQRac">直聘</span></li></ul>
          <div class="job-sec-text">岗位职责<br>负责服务端接口开发。<br><br>任职要求<br>熟悉 Java。</div>
          <div class="job-boss-info"><h2 class="name">某女士<span class="boss-active-time">刚刚活跃</span></h2>
            <div class="boss-info-attr">某智能HR<em class="vdot">·</em>招聘者</div></div>
        </div>
        <div class="job-detail-section job-detail-company">
          <div class="detail-section-item company-info-box"><h3>公司介绍</h3>
            <div class="job-sec-text fold-text">某智能公司位于上海，主营人工智能软件开发……</div></div>
          <div class="detail-section-item business-info-box"><ul class="level-list">
            <li class="company-name">上海市某智能科技有限公司<span>公司名称</span></li></ul></div>
        </div>
      </div>
    </div></div>
  </div>`;
}
