(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n || 0);
  const integer = n => new Intl.NumberFormat('en-US').format(n || 0);
  const pct = n => `${(n * 100).toFixed(1)}%`;
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const aliases = {
    order_id:['order_id','订单号','订单编号'],date:['date','order_date','订单日期','日期'],platform:['platform','channel','平台','渠道'],country:['country','market','国家','国家/地区'],sku:['sku','product_id','商品编码'],product:['product','product_name','商品','商品名称'],quantity:['quantity','qty','数量'],currency:['currency','币种'],revenue:['revenue','sales','gmv','销售额','收入'],product_cost:['product_cost','cogs','商品成本'],shipping_cost:['shipping_cost','shipping','物流成本','运费'],ad_spend:['ad_spend','advertising','广告费','广告成本'],platform_fee:['platform_fee','fee','平台费用','平台佣金'],refund_amount:['refund_amount','refund','退款金额'],fx_to_usd:['fx_to_usd','usd_rate','美元汇率']
  };
  const fields = Object.keys(aliases);
  const required = ['order_id','date','platform','country','revenue'];
  const costFields = ['product_cost','shipping_cost','ad_spend','platform_fee'];
  let rows = [], source = 'demo', quality = {total:0,skipped:0,missingCosts:[],duplicates:0};

  function csvParse(text) {
    const out=[]; let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"') {if(quoted && text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
      else if(c===',' && !quoted){row.push(cell);cell='';}
      else if((c==='\n'||c==='\r') && !quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()!==''))out.push(row);row=[];cell='';}
      else cell+=c;
    }
    if(quoted)throw new Error('CSV 引号未闭合，请检查文件格式。');
    row.push(cell);if(row.some(x=>x.trim()!==''))out.push(row);
    return out;
  }
  function parseAmount(value){const n=Number(String(value??'').replace(/[$€£¥￥,\s]/g,''));return Number.isFinite(n)?n:NaN;}
  function normalizeCSV(text) {
    const grid=csvParse(text.replace(/^\uFEFF/,''));
    if(grid.length<2)throw new Error('CSV 需要包含表头和至少一行订单。');
    const headers=grid[0].map(h=>h.trim().toLowerCase());
    const index={};fields.forEach(f=>index[f]=headers.findIndex(h=>aliases[f].some(a=>a.toLowerCase()===h)));
    const missing=required.filter(f=>index[f]<0);
    if(missing.length)throw new Error(`缺少必填列：${missing.join(', ')}。请下载模板查看格式。`);
    const missingCosts=costFields.filter(f=>index[f]<0);
    const results=[];let skipped=0;const seen=new Set();let duplicates=0;
    for(const cells of grid.slice(1)){
      const get=f=>index[f]<0?'':(cells[index[f]]??'').trim();
      const rawDate=get('date');const date=rawDate.slice(0,10).replace(/\//g,'-');
      const currency=(get('currency')||'USD').toUpperCase();
      const fxRaw=get('fx_to_usd');const fx=fxRaw===''?(currency==='USD'?1:NaN):parseAmount(fxRaw);
      const revenue=parseAmount(get('revenue'));const quantity=get('quantity')===''?1:parseAmount(get('quantity'));
      if(!get('order_id')||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T00:00:00Z`))||!get('platform')||!get('country')||!Number.isFinite(revenue)||!Number.isFinite(fx)||fx<=0||!Number.isFinite(quantity)||quantity<0){skipped++;continue;}
      const costs={};let invalid=false;
      for(const f of [...costFields,'refund_amount']){const raw=get(f);const n=raw===''?0:parseAmount(raw);if(!Number.isFinite(n)){invalid=true;break;}costs[f]=n*fx;}
      if(invalid){skipped++;continue;}
      const key=`${get('platform')}|${get('order_id')}|${get('sku')}|${date}`;
      if(seen.has(key)){duplicates++;continue;}seen.add(key);
      results.push({order_id:get('order_id'),date,platform:get('platform'),country:get('country'),sku:get('sku')||'未填写 SKU',product:get('product')||get('sku')||'未命名商品',quantity,currency,revenue:revenue*fx,...costs,fx_to_usd:fx});
    }
    if(!results.length)throw new Error('没有可分析的订单。请检查日期、销售额与非美元订单的 fx_to_usd 汇率。');
    return {rows:results,quality:{total:grid.length-1,skipped,missingCosts,duplicates}};
  }
  function sampleRows(){
    const platforms=['Amazon','Shopify','TikTok Shop','eBay'];
    const countries=['美国','英国','德国','加拿大','澳大利亚','法国'];
    const products=[['A1001','便携咖啡机',89,43],['A1002','无线充电器',39,13],['A1003','旅行收纳套装',32,10],['A1004','户外露营灯',58,23],['A1005','智能保温杯',49,20],['A1006','宠物饮水机',72,31]];
    const data=[];
    for(let i=0;i<440;i++){
      const d=new Date(Date.UTC(2026,7,1+(i*17)%92));const date=d.toISOString().slice(0,10);
      const p=platforms[(i*7+Math.floor(i/11))%4],c=countries[(i*5+Math.floor(i/7))%6],prod=products[(i*11+Math.floor(i/9))%6];
      const quantity=1+(i%7===0?1:0),revenue=prod[2]*quantity*(1+(i%5)*.025),refund_amount=i%29===0?revenue:0;
      data.push({order_id:`ORD-${String(i+1).padStart(5,'0')}`,date,platform:p,country:c,sku:prod[0],product:prod[1],quantity,currency:'USD',revenue,product_cost:prod[3]*quantity,shipping_cost:5+(i%5),ad_spend:3+(i%7)*1.2,platform_fee:revenue*(p==='Shopify'?.045:.11),refund_amount,fx_to_usd:1});
    }
    return data;
  }
  function net(r){return r.revenue-r.refund_amount;}
  function profit(r){return net(r)-r.product_cost-r.shipping_cost-r.ad_spend-r.platform_fee;}
  function sum(a,f){return a.reduce((v,r)=>v+f(r),0);}
  function group(data,key){const map=new Map();data.forEach(r=>{const k=key(r);if(!map.has(k))map.set(k,[]);map.get(k).push(r);});return [...map].map(([name,items])=>({name,items,revenue:sum(items,net),profit:sum(items,profit)})).sort((a,b)=>b.revenue-a.revenue);}
  function filtered(){const start=$('start-date').value,end=$('end-date').value,platform=$('platform-filter').value,country=$('country-filter').value;return rows.filter(r=>(!start||r.date>=start)&&(!end||r.date<=end)&&(!platform||r.platform===platform)&&(!country||r.country===country));}
  function fillSelect(id,values,label){const select=$(id),old=select.value;select.innerHTML=`<option value="">${label}</option>`+values.map(v=>`<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('');if(values.includes(old))select.value=old;}
  function refreshOptions(){fillSelect('platform-filter',[...new Set(rows.map(r=>r.platform))].sort(),'全部平台');fillSelect('country-filter',[...new Set(rows.map(r=>r.country))].sort(),'全部国家 / 地区');}
  function renderTrend(data){
    const el=$('trend-chart');if(!data.length){el.innerHTML='<div class="empty">当前筛选条件下没有数据</div>';return;}
    const byDay=group(data,r=>r.date).sort((a,b)=>a.name.localeCompare(b.name));
    const points=byDay.length>30?aggregateWeeks(byDay):byDay;
    const W=700,H=210,L=43,R=10,T=10,B=28,plotW=W-L-R,plotH=H-T-B;
    const min=Math.min(0,...points.map(p=>p.profit));const max=Math.max(1,...points.map(p=>p.revenue));const range=max-min||1;
    const x=i=>L+(points.length===1?plotW/2:i*plotW/(points.length-1));const y=v=>T+(max-v)/range*plotH;
    const line=field=>points.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p[field]).toFixed(1)}`).join(' ');
    const area=`${line('revenue')} L${x(points.length-1).toFixed(1)},${y(min).toFixed(1)} L${x(0).toFixed(1)},${y(min).toFixed(1)} Z`;
    const ticks=[0,1,2,3].map(i=>{const val=min+(range*i/3),yy=y(val);return `<line class="chart-gridline" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text class="chart-axis" x="${L-7}" y="${yy+3}" text-anchor="end">${Math.round(val/1000)}k</text>`}).join('');
    const labels=[0,Math.floor((points.length-1)/2),points.length-1].filter((v,i,a)=>a.indexOf(v)===i).map(i=>`<text class="chart-axis" x="${x(i)}" y="${H-4}" text-anchor="middle">${escapeHTML(points[i].name.slice(5))}</text>`).join('');
    el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="净销售额与利润趋势"><defs><linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2cc8ac" stop-opacity=".22"/><stop offset="1" stop-color="#2cc8ac" stop-opacity="0"/></linearGradient></defs>${ticks}<path class="chart-fill" d="${area}"/><path class="chart-revenue" d="${line('revenue')}"/><path class="chart-profit" d="${line('profit')}"/>${labels}</svg>`;
  }
  function aggregateWeeks(days){const map=new Map();days.forEach(p=>{const d=new Date(`${p.name}T00:00:00Z`),day=d.getUTCDay(),monday=new Date(d);monday.setUTCDate(d.getUTCDate()-((day+6)%7));const k=monday.toISOString().slice(0,10);const v=map.get(k)||{name:k,revenue:0,profit:0};v.revenue+=p.revenue;v.profit+=p.profit;map.set(k,v);});return [...map.values()];}
  function renderBars(id,groups,type){const el=$(id);if(!groups.length){el.innerHTML='<div class="empty">当前筛选条件下没有数据</div>';return;}const total=sum(groups,g=>g.revenue),max=groups[0].revenue||1;el.innerHTML=groups.slice(0,type==='platform'?6:5).map((g,i)=>type==='platform'?`<div class="platform-row"><span class="platform-name" title="${escapeHTML(g.name)}">${escapeHTML(g.name)}</span><div class="platform-track"><div class="platform-fill" style="width:${Math.max(0,g.revenue/max*100)}%;background:${['#25c3a8','#72d0bc','#a7dfd3','#d5ede6','#91bbc2','#b9d6d8'][i]}"></div></div><span class="platform-value">${pct(total?g.revenue/total:0)}</span></div>`:`<div class="country-row"><span class="country-name">${escapeHTML(g.name)}</span><div class="country-track"><div class="country-fill" style="width:${Math.max(0,g.revenue/max*100)}%"></div></div><span class="country-value">${money(g.revenue)}</span></div>`).join('');}
  function renderProducts(data){const groups=group(data,r=>r.sku);$('sku-count').textContent=`${groups.length} 个 SKU`;$('product-body').innerHTML=groups.length?groups.slice(0,8).map(g=>{const r=g.items[0],quantity=sum(g.items,x=>x.quantity);return `<tr><td><strong>${escapeHTML(r.product)}</strong><small>${escapeHTML(g.name)}</small></td><td>${integer(quantity)}</td><td>${money(g.revenue)}</td><td class="${g.profit>=0?'positive':'negative'}">${money(g.profit)}</td><td><span class="metric-chip">${pct(g.revenue?g.profit/g.revenue:0)}</span></td></tr>`}).join(''):'<tr><td colspan="5" class="empty">当前筛选条件下没有商品</td></tr>';}
  function renderInsights(data,platforms,countries){const el=$('insights');if(!data.length){el.innerHTML='<div class="empty">调整筛选条件后查看经营信号</div>';return;}const total=sum(data,net),orderCount=new Set(data.map(r=>`${r.platform}|${r.order_id}`)).size,refund=sum(data,r=>r.refund_amount),top=platforms[0],topCountry=countries[0];const items=[['↗','领先平台',`${top.name} 贡献 ${pct(total?top.revenue/total:0)} 的净销售额。`],['◎','重点市场',`${topCountry.name} 净销售额 ${money(topCountry.revenue)}，利润率 ${pct(topCountry.revenue?topCountry.profit/topCountry.revenue:0)}。`],['▣','订单质量',`客单价 ${money(orderCount?total/orderCount:0)}，退款占原始销售额 ${pct(sum(data,r=>r.revenue)?refund/sum(data,r=>r.revenue):0)}。`]];el.innerHTML=items.map(([icon,title,body])=>`<div class="insight"><span class="insight-icon">${icon}</span><div><strong>${title}</strong><p>${body}</p></div></div>`).join('');}
  function render(){const data=filtered(),revenue=sum(data,net),p=sum(data,profit),orders=new Set(data.map(r=>`${r.platform}|${r.order_id}`)).size,platforms=group(data,r=>r.platform),countries=group(data,r=>r.country);$('kpi-revenue').textContent=money(revenue);$('kpi-profit').textContent=money(p);$('kpi-orders').textContent=integer(orders);$('kpi-margin').textContent=pct(revenue?p/revenue:0);$('filter-count').textContent=`${integer(data.length)} 条订单商品记录`;$('period-label').textContent=data.length?`${data.reduce((a,r)=>a<r.date?a:r.date,data[0].date)} 至 ${data.reduce((a,r)=>a>r.date?a:r.date,data[0].date)}`:'无数据';renderTrend(data);renderBars('platform-chart',platforms,'platform');renderBars('country-chart',countries,'country');renderInsights(data,platforms,countries);renderProducts(data);$('data-quality').innerHTML=`当前数据：<b>${integer(rows.length)} 条有效记录</b> · 跳过 ${quality.skipped} 条 · 去重 ${quality.duplicates} 条${quality.missingCosts.length?` · 缺少成本列：${escapeHTML(quality.missingCosts.join(', '))}（按 0 估算）`:''}`;}
  function setNotice(message){$('notice').textContent=message;$('notice').hidden=!message;}
  function download(name,content){const blob=new Blob(['\uFEFF',content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function csvEscape(v){const s=String(v??'');return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
  function toCSV(data){return [fields.join(','),...data.map(r=>fields.map(f=>csvEscape(f==='currency'?'USD':f==='fx_to_usd'?1:r[f])).join(','))].join('\r\n');}
  let demoTimer=null,demoBackup=null,demoSpotlight=null;
  function stopDemo(){
    clearTimeout(demoTimer);
    if(demoSpotlight)demoSpotlight.classList.remove('demo-spotlight');
    demoSpotlight=null;$('demo-guide').hidden=true;
    if(demoBackup){rows=demoBackup.rows;quality=demoBackup.quality;source=demoBackup.source;$('source-badge').textContent=demoBackup.badge;refreshOptions();for(const [id,value] of Object.entries(demoBackup.filters))$(id).value=value;render();demoBackup=null;setNotice('自动演示已结束，原来的数据和筛选条件已恢复。');}
  }
  function showDemoStep(index,title,description,selector){
    if(demoSpotlight)demoSpotlight.classList.remove('demo-spotlight');
    demoSpotlight=document.querySelector(selector);
    if(demoSpotlight){demoSpotlight.classList.add('demo-spotlight');demoSpotlight.scrollIntoView({behavior:'smooth',block:'center'});}
    $('demo-step').textContent=`自动演示 · ${index}/5`;
    $('demo-title').textContent=title;$('demo-description').textContent=description;
    $('demo-progress-fill').style.width=`${index*20}%`;
    $('demo-guide').hidden=false;
  }
  function startDemo(){
    if(demoBackup)return;
    demoBackup={rows,quality,source,badge:$('source-badge').textContent,filters:Object.fromEntries(['start-date','end-date','platform-filter','country-filter'].map(id=>[id,$(id).value]))};
    const imported=normalizeCSV(toCSV(sampleRows()));rows=imported.rows;quality=imported.quality;source='demo-import';$('source-badge').textContent='演示导入 CSV';
    ['start-date','end-date','platform-filter','country-filter'].forEach(id=>$(id).value='');refreshOptions();render();setNotice('演示：已通过 CSV 解析流程导入 440 条示例订单商品记录。');
    showDemoStep(1,'导入多平台订单','先把 Amazon、Shopify、TikTok Shop 和 eBay 的订单合并导入。页面立即计算销售额、利润、订单数和利润率。','.kpi-grid');
    demoTimer=setTimeout(()=>{$('platform-filter').value='Amazon';render();showDemoStep(2,'筛选 Amazon','只看 Amazon 订单，所有指标、趋势、市场和商品排行同步更新。','.filters');
      demoTimer=setTimeout(()=>{const top=group(filtered(),r=>r.country)[0]?.name;if(top)$('country-filter').value=top;render();showDemoStep(3,'聚焦重点市场',`再选择 ${top||'目标'} 市场，比较这个平台在该地区的经营表现。`,'#markets');
        demoTimer=setTimeout(()=>{showDemoStep(4,'查看商品利润','商品表按净销售额排序，还能看到每个 SKU 的销量、估算利润和利润率。','.table-panel');
          demoTimer=setTimeout(()=>{showDemoStep(5,'换成你的真实数据','这里可以下载 CSV 模板、导入真实订单，或导出筛选结果。点击右上角 × 可结束演示并恢复原数据。','#data');},2900);
        },2900);
      },2900);
    },2900);
  }
  document.querySelectorAll('.start-demo').forEach(button=>button.addEventListener('click',startDemo));
  $('close-demo').addEventListener('click',stopDemo);
  $('file-input').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;if(demoBackup)stopDemo();try{if(file.size>10*1024*1024)throw new Error('文件超过 10 MB，请拆分后导入。');const parsed=normalizeCSV(await file.text());rows=parsed.rows;quality=parsed.quality;source='import';$('source-badge').textContent=file.name;['start-date','end-date'].forEach(id=>$(id).value='');['platform-filter','country-filter'].forEach(id=>$(id).value='');refreshOptions();render();setNotice(`已导入 ${rows.length} 条有效记录${quality.skipped?`，跳过 ${quality.skipped} 条无效记录`:''}${quality.missingCosts.length?'。部分成本列缺失，利润仅供参考':''}。`);}catch(err){setNotice(`导入失败：${err.message}`);}event.target.value='';});
  ['start-date','end-date','platform-filter','country-filter'].forEach(id=>$(id).addEventListener('change',render));
  $('reset-filters').addEventListener('click',()=>{['start-date','end-date','platform-filter','country-filter'].forEach(id=>$(id).value='');render();});
  $('restore-demo').addEventListener('click',()=>{rows=sampleRows();quality={total:rows.length,skipped:0,missingCosts:[],duplicates:0};source='demo';$('source-badge').textContent='示例数据';['start-date','end-date','platform-filter','country-filter'].forEach(id=>$(id).value='');refreshOptions();render();setNotice('已恢复示例数据。');});
  $('download-template').addEventListener('click',()=>download('crossborder_orders_template.csv',`${fields.join(',')}\r\nEXAMPLE-001,2026-11-01,Amazon,美国,SKU-001,示例商品,1,USD,79,30,6,5,8,0,1`));
  $('export-filtered').addEventListener('click',()=>{const data=filtered();if(!data.length){setNotice('当前筛选条件下没有可导出的记录。');return;}download('crossborder_filtered_usd.csv',toCSV(data));setNotice('已导出筛选后的 USD 折算记录。');});
  rows=sampleRows();quality={total:rows.length,skipped:0,missingCosts:[],duplicates:0};refreshOptions();render();
})();
