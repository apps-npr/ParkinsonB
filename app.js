// 🔴 1. ใส่ URL API ของ Google Apps Script ที่นี่ 🔴
const API_URL = "https://script.google.com/macros/s/AKfycbzJ_FI7UePuEJ9-QG7w64pTG3vWhsitGFQ1NcrLgvDb2a0oQzhpmN4rTo8DbJ783Kc/exec"; 

let drugMaster = []; 
let timeline; 
let timelineItems; 
let timelineGroups; 
let currentPatientId = "";
let savedADRData = { symptoms: [], advices: [], note: "", drpClass: "ไม่พบปัญหาด้านยา (None)" };

document.addEventListener('DOMContentLoaded', () => {
    fetch('./drugs.json').then(r => r.json()).then(d => { 
        drugMaster = d; 
        const s=document.getElementById('simDrug'); 
        d.forEach(x=>s.add(new Option(x.name,x.id))); 
    }).catch(e=>alert("โหลดฐานข้อมูลยาล้มเหลว"));

    // 🌟 2. ตัวช่วยพิมพ์เวลา (Smart Time Input: พิมพ์ 0800 จะแปลงเป็น 08:00 อัตโนมัติ)
    document.querySelectorAll('.time-input').forEach(inp => {
        inp.addEventListener('input', function(e) {
            let v = this.value.replace(/[^0-9]/g, ''); // บังคับรับแค่ตัวเลข
            if (v.length >= 3) {
                v = v.substring(0, 2) + ':' + v.substring(2, 4);
            }
            this.value = v;
        });
        inp.addEventListener('blur', function() {
            // ถ้ากรอกไม่ครบ 4 ตัว เช่น 800 ให้ปัดเป็น 08:00
            let v = this.value.replace(/[^0-9]/g, '');
            if(v.length === 3) v = '0' + v;
            if(v.length === 4) {
                this.value = v.substring(0, 2) + ':' + v.substring(2, 4);
            }
        });
    });
});

async function loadPatientData() {
    const q = document.getElementById('pdInput').value.trim();
    if(!q) return alert('กรอก HN หรือ PD No.');
    
    savedADRData = { symptoms: [], advices: [], note: "", drpClass: "ไม่พบปัญหาด้านยา (None)" };
    document.querySelectorAll('.adr-check').forEach(cb => cb.checked = false);
    if(document.getElementById('drpClass')) document.getElementById('drpClass').value = "ไม่พบปัญหาด้านยา (None)";
    document.getElementById('adrNote').value = "";
    document.getElementById('reportArea').classList.add('d-none');
    
    try {
        const res = await fetch(`${API_URL}?action=getPatientData&pd_no=${q}`);
        const data = await res.json();
        if(data.status === 'success') {
            currentPatientId = data.data.patient.PD_No;
            document.getElementById('pName').innerText = `👤 ${data.data.patient.Name} (อายุ: ${data.data.patient.Age})`;
            document.getElementById('pHN').innerText = `HN: ${data.data.patient.HN}`;
            
            let hTxt = `ผู้ป่วย: ${data.data.patient.Name} | อายุ: ${data.data.patient.Age} ปี | HN: ${data.data.patient.HN}`;
            document.getElementById('printPatientNameHn1').innerText = hTxt;
            document.getElementById('printPatientNameHn2').innerText = hTxt;
            
            document.getElementById('patientInfoCard').classList.remove('d-none');
            document.getElementById('simulationPanel').classList.remove('d-none');
            document.getElementById('btnArchive').classList.remove('d-none');
            renderTimeline(data.data.medications, data.data.logs);
        } else alert(data.message);
    } catch(e) { alert('เชื่อมต่อล้มเหลว'); }
}

function getDrugClass(t) {
    if(!t) return 'med-ldopa-ir';
    if(t.includes('CR')) return 'med-ldopa-cr';
    if(t.includes('Fast')) return 'med-ldopa-fast';
    if(t.includes('L-Dopa')) return 'med-ldopa-ir';
    if(t.includes('COMT')) return 'med-comt';
    if(t.includes('Agonist')) return 'med-agonist';
    if(t.includes('MAO')) return 'med-mao';
    if(t.includes('Anti')) return 'med-antichoc';
    return 'med-ldopa-ir';
}

function renderTimeline(meds, logs) {
    const c = document.getElementById('visualization'); c.innerHTML = "";
    timelineItems = new vis.DataSet(); timelineGroups = new vis.DataSet();
    
    timelineGroups.add({ id: 'spacer', content: '', style: 'height: 50px; background: transparent; border: none;', order: 2 });
    timelineGroups.add({ id: 'symptoms', content: '<b>🚨 อาการ</b>', order: 3 });

    const today = new Date().toISOString().split('T')[0];
    moment.locale('th'); 

    meds.forEach(m => {
        const info = drugMaster.find(d => d.id === m.Drug_ID) || {};
        const name = info.name || m.Trade_Name;
        const onset = Number(info.onset || m.Onset_min || 30);
        const dur = Number(info.duration || m.Duration_hr || 4);
        
        if(!timelineGroups.get(m.Drug_ID)) timelineGroups.add({ id: m.Drug_ID, content: name, order: 1 });

        let timeStr = m.Time_Take || "08:00"; 
        if(timeStr.includes("T")) {
            timeStr = timeStr.split("T")[1].substring(0, 5);
        } else if (timeStr.length > 5) {
            timeStr = timeStr.substring(0, 5);
        }

        let start = new Date(`${today}T${timeStr}:00`).getTime() + (onset*60000);
        let end = start + (dur*3600000);
        let mid = new Date(`${today}T23:59:59`).getTime();
        let subId = m.Drug_ID; // 🌟 ใช้ Drug_ID เป็น Subgroup บังคับให้อยู่บรรทัดเดียวกัน

        let commonData = {
            id: m.Drug_ID, 
            Trade_Name: name, 
            Dose: m.Dose, 
            onset: onset, 
            Time_Take: timeStr, 
            isOriginal: true 
        };

        if(end > mid) {
            timelineItems.add({ id: `M_${Math.random()}`, group: m.Drug_ID, content: `${m.Dose}`, start: new Date(start), end: new Date(mid), className: getDrugClass(info.type), subgroup: subId, _drugData: commonData });
            timelineItems.add({ id: `M_W_${Math.random()}`, group: m.Drug_ID, content: `(ต่อ)`, start: new Date(`${today}T00:00:00`), end: new Date(new Date(`${today}T00:00:00`).getTime() + (end-mid)), className: getDrugClass(info.type), subgroup: subId, style: 'opacity:0.7; border-style:dashed;', _drugData: {id: m.Drug_ID, isWrapped: true } });
        } else {
            timelineItems.add({ id: `M_${Math.random()}`, group: m.Drug_ID, content: `${m.Dose}`, start: new Date(start), end: new Date(end), className: getDrugClass(info.type), subgroup: subId, _drugData: commonData });
        }
    });

    logs.forEach(l => {
        if(l.Event_Type === 'OFF-Time' || l.Event_Type === 'Dyskinesia') {
            let s = new Date(`${today}T${l.Start_Time.substring(0,5)}:00`);
            let e = new Date(`${today}T${l.End_Time.substring(0,5)}:00`);
            timelineItems.add({ id: l.Log_ID, group: 'symptoms', content: l.Event_Type, start: s, end: e, className: l.Event_Type === 'OFF-Time'?'log-off':'log-dyskinesia' });
        }
    });

    timeline = new vis.Timeline(c, timelineItems, timelineGroups, {
        start: new Date(`${today}T00:00:00`), end: new Date(`${today}T23:59:59`),
        stack: true, groupOrder: 'order', margin: { item: 10, axis: 5 },
        zoomable: false, locale: 'th',
        editable: { add: false, updateTime: true, remove: true },
        onRemove: (item, cb) => { if(confirm("ลบข้อมูล?")) { fetch(API_URL, {method:'POST', body:JSON.stringify({action:'deleteLog', Log_ID:item.id})}); cb(item); } else cb(null); }
    });
}

// ระบบพิมพ์: กางรูป 100% ชิดขอบ
function printSystem() {
    const today = new Date().toISOString().split('T')[0];
    timeline.setWindow(new Date(`${today}T00:00:00`), new Date(`${today}T23:59:59`), { animation: false });
    
    generateReport();
    document.getElementById('reportArea').classList.remove('d-none');

    setTimeout(() => {
        let viz = document.querySelector('#visualization');
        let originalW = viz.style.width;
        viz.style.width = "1800px"; // ขยายชดเชยที่ว่างด้านขวา
        
        html2canvas(viz, { scale: 2, logging: false }).then(canvas => {
            viz.style.width = originalW;
            document.getElementById('graph-snapshot').src = canvas.toDataURL("image/png");
        });
    }, 500);
}

function generateReport() {
    let all = timelineItems.get();
    let meds = {}; 
    let offMs = 0, dysMs = 0;
    
    all.forEach(i => {
        if(i.group !== 'symptoms' && i._drugData && i._drugData.isOriginal) {
            let time = i._drugData.Time_Take || "00:00";
            if(!meds[i._drugData.Trade_Name]) meds[i._drugData.Trade_Name] = [];
            meds[i._drugData.Trade_Name].push(`<b>${i._drugData.Dose}</b> (${time})`);
        }
        if(i.content === 'OFF-Time') offMs += (i.end - i.start);
        if(i.content === 'Dyskinesia') dysMs += (i.end - i.start);
    });

    let html = `<div class="print-row"><div class="print-col-left">`;
    
    if(offMs > 0 || dysMs > 0) {
        let offH = (offMs/3600000).toFixed(1);
        let dysH = (dysMs/3600000).toFixed(1);
        let offPct = ((offH/16)*100).toFixed(1);
        let dysPct = ((dysH/16)*100).toFixed(1);
        let offSev = offPct<=25?"เล็กน้อย":(offPct<=50?"ปานกลาง":"รุนแรง");
        let dysSev = dysPct<=25?"เล็กน้อย":(dysPct<=50?"ปานกลาง":"รุนแรง");

        html += `<div class="report-header text-primary">📊 Motor Fluctuations:</div><ul>`;
        if(offMs) html += `<li>Wearing-off: ${offH} ชม. (${offPct}% - ${offSev})</li>`;
        if(dysMs) html += `<li>Dyskinesia: ${dysH} ชม. (${dysPct}% - ${dysSev})</li>`;
        html += `</ul>`;
    }

    html += `<div class="report-header text-success">📌 แผนการจัดตารางยาใหม่:</div><ul>`;
    for(let k in meds) html += `<li><strong>${k}</strong>: ${meds[k].sort().join(', ')}</li>`;
    html += `</ul>`;

    html += `<div class="report-header text-danger">⚠️ DRPs [${savedADRData.drpClass}]:</div>`;
    if(savedADRData.symptoms.length > 0) {
        html += `<ul>${savedADRData.symptoms.map(s => `<li>[X] ${s}</li>`).join('')}</ul>`;
    } else html += `<p>- ไม่พบปัญหา DRPs</p>`;
    html += `</div>`;

    html += `<div class="print-col-right">`;
    
    let interventions = [];
    let hasFoodInt = savedADRData.symptoms.some(s => s.includes("ทานยาก่อนอาหาร"));
    let hasDoseRed = savedADRData.symptoms.some(s => s.includes("ปรับลดขนาดยา"));
    let hasNgTube = savedADRData.symptoms.some(s => s.includes("บริหารยาทางสายยาง"));
    let hasPostural = savedADRData.symptoms.some(s => s.includes("ทรงตัวลำบาก"));
    
    if (hasNgTube && Object.keys(meds).some(m => m.includes("HBS") || m.includes("PD 24h"))) {
        interventions.push(`🚨 <b>[CRITICAL]</b> ห้ามบดยา CR (HBS, PD 24h) ในผู้ป่วย NG Tube เปลี่ยนเป็น IR/Dispersible`);
    }
    if (hasPostural) interventions.push(`🚨 <b>[Warning]</b> ทรงตัวลำบากช่วง OFF-time เสี่ยงหกล้มสูง ควรปรับยา`);
    if (offMs > 0 && hasFoodInt) interventions.push(`🚨 <b>[Warning]</b> OFF-time อาจเกิดจาก Food-Interaction เน้นย้ำเวลายา`);
    
    [...new Set(savedADRData.advices)].forEach(adv => interventions.push(adv));

    if(interventions.length > 0) {
        html += `<div class="report-header text-primary">💡 ข้อเสนอแนะเภสัชกร:</div><ul>`;
        interventions.forEach(inv => html += `<li>${inv}</li>`);
        html += `</ul>`;
    }

    if(savedADRData.note) html += `<div class="mt-2 p-1 bg-light border rounded"><strong>📝 บันทึกเพิ่มเติม:</strong><br>${savedADRData.note}</div>`;
    
    html += `<div class="signature-box">ลงชื่อเภสัชกรผู้ประเมิน</div></div></div>`;

    document.getElementById('reportContent').innerHTML = html;
}

// ตัวแปลงวันที่เพื่อเทียบหา KPI
function normalizeDateStr(dStr) {
    if(!dStr) return "1970-01-01";
    if(dStr.includes("T")) return dStr.split("T")[0]; 
    if(dStr.includes("/")) {
        let p = dStr.split("/");
        let d = p[0].padStart(2, '0');
        let m = p[1].padStart(2, '0');
        let y = parseInt(p[2], 10);
        if(y > 2500) y -= 543; // แปลง พ.ศ. เป็น ค.ศ.
        return `${y}-${m}-${d}`;
    }
    return dStr; 
}

// 🌟 ระบบ KPI แบบเจาะลึก อิงฟอร์ม Word
async function fetchKPIReport() {
    let startInput = document.getElementById('kpiStart').value;
    let endInput = document.getElementById('kpiEnd').value;
    if(!startInput || !endInput) return alert("กรุณาเลือกวันที่");

    try {
        document.getElementById('kpiResult').value = "กำลังดึงข้อมูลและประมวลผล...";
        const res = await fetch(`${API_URL}?action=getKPIReport`);
        const data = await res.json();
        
        let targetLogs = data.logs.filter(l => {
            let logDate = normalizeDateStr(l.Date);
            return logDate >= startInput && logDate <= endInput;
        });
        
        let uniquePatients = new Set(targetLogs.map(l => l.PD_No));
        let totalPatients = uniquePatients.size;
        
        let cMotorAny = 0, cOff = 0, cDys = 0, cDelOn = 0, cMornAki = 0;
        let cDrpAny = 0, cNonComp = 0, cDrugFood = 0, cAdr = 0;

        uniquePatients.forEach(pd => {
            let pLogs = targetLogs.filter(l => l.PD_No === pd);
            
            // หมวด Motor Complications
            let hasOff = pLogs.some(l => l.Event_Type === 'OFF-Time' || (l.Detail_Note && l.Detail_Note.includes('Wearing-off')));
            let hasDys = pLogs.some(l => l.Event_Type === 'Dyskinesia' || (l.Detail_Note && l.Detail_Note.includes('Dyskinesia')));
            let hasDelOn = pLogs.some(l => l.Detail_Note && l.Detail_Note.includes('Delayed ON'));
            let hasMorn = pLogs.some(l => l.Detail_Note && l.Detail_Note.includes('Morning Akinesia'));
            if(hasOff || hasDys || hasDelOn || hasMorn) cMotorAny++;
            if(hasOff) cOff++; if(hasDys) cDys++; if(hasDelOn) cDelOn++; if(hasMorn) cMornAki++;

            // หมวด DRPs
            let hasNonComp = pLogs.some(l => l.Detail_Note && (l.Detail_Note.includes('ลืมกินยา') || l.Detail_Note.includes('ปรับเพิ่ม') || l.Detail_Note.includes('ปรับลด') || l.Detail_Note.includes('ผิดขนาด')));
            let hasDrugFood = pLogs.some(l => l.Detail_Note && (l.Detail_Note.includes('ก่อนอาหารน้อยกว่า 30 นาที') || l.Detail_Note.includes('อาหารโปรตีนสูง')));
            let hasAdr = pLogs.some(l => l.Detail_Note && (l.Detail_Note.includes('หน้ามืด') || l.Detail_Note.includes('หกล้ม') || l.Detail_Note.includes('คลื่นไส้') || l.Detail_Note.includes('ภาพหลอน') || l.Detail_Note.includes('นอนไม่หลับ') || l.Detail_Note.includes('ท้องผูก') || l.Detail_Note.includes('ง่วงซึม') || l.Detail_Note.includes('ปัสสาวะ') || l.Detail_Note.includes('น้ำลายไหล') || l.Detail_Note.includes('กลืนลำบาก') || l.Detail_Note.includes('วิงเวียน')));
            
            if(hasNonComp || hasDrugFood || hasAdr) cDrpAny++;
            if(hasNonComp) cNonComp++; if(hasDrugFood) cDrugFood++; if(hasAdr) cAdr++;
        });
        
        let getPct = (count) => totalPatients ? ((count/totalPatients)*100).toFixed(1) : 0;

        let resultTxt = `รายงานตัวชี้วัดผลการปฏิบัติงาน คลินิกพาร์กินสัน\n`;
        resultTxt += `ช่วงเวลา: ${startInput} ถึง ${endInput}\n\n`;
        resultTxt += `1. ภาระงานคลินิกพาร์กินสัน\n`;
        resultTxt += `  - ผู้ป่วยมารับบริการตามนัดทั้งหมด: ${totalPatients} ราย\n\n`;
        
        resultTxt += `2. ปัญหาความผิดปกติทางการเคลื่อนไหว (Motor Complications)\n`;
        resultTxt += `  - พบผู้ป่วยที่มีอาการรวม: ${cMotorAny} ราย (${getPct(cMotorAny)}%)\n`;
        resultTxt += `      > Wearing-off: ${cOff} ราย\n`;
        resultTxt += `      > Dyskinesia: ${cDys} ราย\n`;
        resultTxt += `      > Delayed ON: ${cDelOn} ราย\n`;
        resultTxt += `      > Morning Akinesia: ${cMornAki} ราย\n\n`;

        resultTxt += `3. ปัญหาด้านยา (Drug-Related Problems: DRPs)\n`;
        resultTxt += `  - พบผู้ป่วยที่มีปัญหาด้านยารวม: ${cDrpAny} ราย (${getPct(cDrpAny)}%)\n`;
        resultTxt += `      > ความร่วมมือในการใช้ยา (Non-compliance): ${cNonComp} ราย\n`;
        resultTxt += `      > อันตรกิริยาระหว่างยาและอาหาร (Drug-Food Int.): ${cDrugFood} ราย\n`;
        resultTxt += `      > อาการข้างเคียงจากยา (ADRs): ${cAdr} ราย\n`;

        document.getElementById('kpiResult').value = resultTxt;
    } catch(e) { alert("ดึงข้อมูลล้มเหลว: " + e); }
}

// 🌟 ฟังก์ชันแปลง Text Area เป็นไฟล์ Excel
function exportKPIExcel() {
    let text = document.getElementById('kpiResult').value;
    if(!text || text.includes('กำลังดึงข้อมูล')) return alert("กรุณาดึงข้อมูลให้เสร็จก่อนส่งออก");

    // สร้างโครงสร้างตาราง HTML ง่ายๆ เพื่อให้ Excel อ่านได้สวยงาม
    let rows = text.split('\n').map(r => `<tr><td>${r}</td></tr>`).join('');
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table>${rows}</table></body></html>`;

    let blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement("a");
    a.href = url;
    a.download = `KPI_Parkinson_${new Date().toISOString().slice(0,10)}.xls`;
    a.click();
}

// ฟังก์ชันเดิมต่างๆ ไม่มีการปรับแก้ให้หายไป
function saveADR() {
    let cb = document.querySelectorAll('.adr-check:checked');
    savedADRData.symptoms = []; 
    savedADRData.advices = [];
    let reportDetails = [];
    
    cb.forEach(c => { 
        savedADRData.symptoms.push(c.value); 
        reportDetails.push(c.value);
        if(c.dataset.suggest) savedADRData.advices.push(c.dataset.suggest); 
    });
    
    savedADRData.drpClass = document.getElementById('drpClass').value;
    savedADRData.note = document.getElementById('adrNote').value;
    
    if(savedADRData.drpClass) reportDetails.push("Class: " + savedADRData.drpClass);
    if(savedADRData.note) reportDetails.push("Note: " + savedADRData.note);

    bootstrap.Modal.getInstance(document.getElementById('adrModal')).hide();

    if(reportDetails.length > 0) {
        fetch(API_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action: 'addLog', PD_No: currentPatientId, Date: new Date().toLocaleDateString('th-TH'), Event_Type: 'DRPs/ADR Check', Start_Time: '-', End_Time: '-', Reporter: 'Pharmacist', Detail_Note: reportDetails.join(' | ') }) 
        }).then(res => res.json()).then(data => alert('บันทึกข้อมูลคัดกรองลงฐานข้อมูลแล้ว (Log ID: ' + data.logId + ')')).catch(err => alert('เกิดข้อผิดพลาดในการบันทึก ADR'));
    } else {
        alert('บันทึกข้อมูลคัดกรองแล้ว (ไม่ได้ส่งฐานข้อมูลเนื่องจากไม่มีข้อมูล)');
    }
}

function analyzeRegimen() {
    let items = timelineItems.get();
    let hasOff = items.some(i => i.group === 'symptoms' && i.content === 'OFF-Time');
    let hasDys = items.some(i => i.group === 'symptoms' && i.content === 'Dyskinesia');
    let titleStr = "", bestStr = ""; let optList = [];

    if (hasOff && hasDys) {
        titleStr = "⚠️ พบทั้ง OFF-Time และ Dyskinesia"; bestStr = "พิจารณา 'Fractionation': ลดขนาดยา L-dopa ต่อมื้อลง และเพิ่มความถี่มื้อยา";
        optList.push("เพิ่มยา Dopamine Agonist (เช่น Requip PD) หรือ Amantadine เพื่อลด Dyskinesia"); optList.push("พิจารณาการใช้ยาในกลุ่ม COMT Inhibitor อย่างระมัดระวัง");
    } else if (hasOff) {
        titleStr = "📉 พบภาวะยาหมดฤทธิ์ก่อนกำหนด (Wearing-Off)"; bestStr = "พิจารณาเพิ่มยา COMT Inhibitor (Comtan) หรือ MAO-B Inhibitor (Rasagiline)";
        optList.push("ขยับมื้อยา L-dopa ให้ถี่ขึ้น (Shorten Interval)"); optList.push("เปลี่ยนรูปแบบยาเป็น Controlled Release (CR) ในมื้อก่อนนอน");
    } else if (hasDys) {
        titleStr = "📈 พบภาวะยุกยิก (Peak-Dose Dyskinesia)"; bestStr = "ลดขนาดยา L-dopa ในมื้อที่มีอาการลง";
        optList.push("พิจารณาหยุดยา COMT Inhibitor หรือ MAO-B Inhibitor ชั่วคราว"); optList.push("เพิ่มยา Amantadine เพื่อคุมอาการยุกยิก");
    } else {
        titleStr = "✅ ไม่พบ Motor Complications บนกราฟ"; bestStr = "คงแผนการรักษาเดิม (Maintain Current Therapy)";
        optList.push("ติดตามอาการ Non-Motor Symptoms (NMS) เพิ่มเติม");
    }
    document.getElementById('aiTitle').innerText = titleStr; document.getElementById('aiBest').innerHTML = bestStr;
    let ul = document.getElementById('aiOptions'); ul.innerHTML = "";
    optList.forEach(opt => { let li = document.createElement('li'); li.innerHTML = opt; ul.appendChild(li); });
    document.getElementById('aiRecommendationArea').classList.remove('d-none');
}

function addSimulatedMed() { const d=document, i=d.getElementById('simDrug').value, o=d.getElementById('simDose').value, t=d.getElementById('simTime').value; if(!t)return; const inf=drugMaster.find(x=>x.id===i); const td=new Date().toISOString().split('T')[0]; const s=new Date(td+'T'+t+':00').getTime()+(inf.onset*60000); const e=s+(inf.duration*3600000); const mid=new Date(td+'T23:59:59').getTime(); if(!timelineGroups.get(i)) timelineGroups.add({id:i, content:inf.name, order:1}); let sub=i; let commonData = {id:i, Trade_Name:inf.name, Dose:o, onset:inf.onset, Time_Take:t, isOriginal:true}; if(e>mid) { timelineItems.add({id:`M_${Math.random()}`, group:i, content:o, start:new Date(s), end:new Date(mid), className:getDrugClass(inf.type), subgroup:sub, _drugData:commonData}); timelineItems.add({id:`M_W_${Math.random()}`, group:i, content:'(ต่อ)', start:new Date(td+'T00:00:00'), end:new Date(new Date(td+'T00:00:00').getTime()+(e-mid)), className:getDrugClass(inf.type), subgroup:sub, style:'opacity:0.7;border-style:dashed;', _drugData:{id:i, isWrapped:true}}); } else { timelineItems.add({id:`M_${Math.random()}`, group:i, content:o, start:new Date(s), end:new Date(e), className:getDrugClass(inf.type), subgroup:sub, _drugData:commonData}); } }
function addManualSymptom() { 
    let type = document.getElementById('symType').value; let startStr = document.getElementById('symStart').value; let endStr = document.getElementById('symEnd').value;
    if(!startStr || !endStr) return alert("กรุณาระบุเวลาให้ครบ");
    let payload = { action: 'addLog', PD_No: currentPatientId, Date: new Date().toLocaleDateString('th-TH'), Event_Type: type, Start_Time: startStr, End_Time: endStr, Reporter: 'Pharmacist', Detail_Note: "Manual Input" };
    fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) }).then(res => res.json()).then(data => { if(data.status === 'success') { let todayStr = new Date().toISOString().split('T')[0]; timelineItems.add({ id: data.logId || `L_${Math.random()}`, group: 'symptoms', content: type, start: new Date(`${todayStr}T${startStr}:00`), end: new Date(`${todayStr}T${endStr}:00`), className: type === 'OFF-Time' ? 'log-off' : 'log-dyskinesia', editable: { remove: true } }); document.getElementById('symStart').value = ""; document.getElementById('symEnd').value = ""; } else { alert("บันทึกล้มเหลว: " + data.message); } }).catch(err => alert("เกิดข้อผิดพลาดในการบันทึกอาการลงฐานข้อมูล"));
}
function archiveOldLogs() { if(confirm("ล้างกราฟ?")) { fetch(API_URL, {method:'POST', body:JSON.stringify({action:'archiveLogs', PD_No:currentPatientId})}).then(()=>loadPatientData()); } }
function saveMedsToDB() { if(confirm("บันทึกยา?")) { let m=[]; timelineItems.get().forEach(i=>{ if(i.group!=='symptoms' && i._drugData?.isOriginal) m.push({Drug_ID:i._drugData.id, Dose:i._drugData.Dose, Time_Take:i._drugData.Time_Take||"08:00"}); }); fetch(API_URL, {method:'POST', body:JSON.stringify({action:'updatePatientMeds', PD_No:currentPatientId, meds:m})}).then(()=>alert("บันทึกแล้ว")); } }
