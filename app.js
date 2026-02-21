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

    document.querySelectorAll('.time-input').forEach(inp => {
        inp.addEventListener('input', function(e) {
            let v = this.value.replace(/[^0-9]/g, '');
            if (v.length >= 3) v = v.substring(0, 2) + ':' + v.substring(2, 4);
            this.value = v;
        });
        inp.addEventListener('blur', function() {
            let v = this.value.replace(/[^0-9]/g, '');
            if(v.length === 0) return; 
            if(v.length === 3) v = '0' + v; 
            if(v.length === 4) this.value = v.substring(0, 2) + ':' + v.substring(2, 4);
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

            if(data.data.patient.Meal_Break) document.getElementById('mealBreak').value = data.data.patient.Meal_Break;
            if(data.data.patient.Meal_Lunch) document.getElementById('mealLunch').value = data.data.patient.Meal_Lunch;
            if(data.data.patient.Meal_Dinner) document.getElementById('mealDinner').value = data.data.patient.Meal_Dinner;

            // ระบบคัดกรองข้อมูลคนไข้ 30 วันย้อนหลังไปใส่ Modal แจ้งเตือน
            let todayInt = getSortableDateInt(new Date().toISOString().split('T')[0]); 
            let patientReports = data.data.logs.filter(l => {
                let rep = String(l.Reporter || l.reporter || l['ผู้บันทึก'] || Object.values(l)[6] || "");
                if (!rep.includes('Patient')) return false;
                
                let dateVal = l.Date || l.date || l['วันที่'] || l[' Date'] || l['Date '] || Object.values(l)[2];
                let logInt = getSortableDateInt(dateVal); 
                return (todayInt - logInt) <= 100; // คร่าวๆ ประมาณ 30 วัน
            });
            
            let btnLogs = document.getElementById('btnPatientLogs');
            let logContainer = document.getElementById('patientLogsContainer');
            
            if(patientReports.length > 0) {
                btnLogs.classList.remove('d-none');
                let html = '<ul class="list-group shadow-sm">';
                patientReports.reverse().forEach(l => {
                    let ev = l.Event_Type || Object.values(l)[3];
                    let note = l.Detail_Note || Object.values(l)[7];
                    let dateStr = l.Date || Object.values(l)[2];
                    let timeText = (l.Start_Time !== '-' && l.End_Time !== '-') ? ` <span class="badge bg-secondary ms-2">เวลา: ${l.Start_Time} - ${l.End_Time}</span>` : '';
                    html += `<li class="list-group-item border-danger mb-2 rounded">
                        <strong>📅 วันที่บันทึก: ${dateStr}</strong><br>
                        <span class="text-danger fw-bold">👉 ${ev}</span> ${timeText}<br>
                        <span class="text-muted small">รายละเอียด: ${note}</span>
                    </li>`;
                });
                html += '</ul>';
                logContainer.innerHTML = html;
            } else {
                btnLogs.classList.add('d-none');
                logContainer.innerHTML = '<p class="text-center text-muted">ไม่พบประวัติการรายงานอาการด้วยตนเองใน 30 วันที่ผ่านมา</p>';
            }

            document.getElementById('patientInfoCard').classList.remove('d-none');
            document.getElementById('simulationPanel').classList.remove('d-none');
            document.getElementById('btnArchive').classList.remove('d-none');
            
            let clinicOnlyLogs = data.data.logs.filter(l => {
                let rep = String(l.Reporter || l.reporter || l['ผู้บันทึก'] || Object.values(l)[6] || "");
                return !rep.includes('Patient');
            });
            renderTimeline(data.data.medications, clinicOnlyLogs);

        } else {
            alert(data.message);
        }
    } catch(e) { 
        alert('เชื่อมต่อล้มเหลว โปรดตรวจสอบอินเทอร์เน็ต'); 
    }
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
    const c = document.getElementById('visualization'); 
    c.innerHTML = "";
    timelineItems = new vis.DataSet(); 
    timelineGroups = new vis.DataSet();
    
    timelineGroups.add({ id: 'spacer', content: '', style: 'height: 50px; background: transparent; border: none;', order: 2 });
    timelineGroups.add({ id: 'symptoms', content: '<b>🚨 อาการ</b>', order: 3 });

    const todayStr = new Date().toISOString().split('T')[0];
    moment.locale('th'); 

    meds.forEach(m => {
        const info = drugMaster.find(d => d.id === m.Drug_ID) || {};
        const name = info.name || m.Trade_Name;
        const onset = Number(info.onset || m.Onset_min || 30);
        const dur = Number(info.duration || m.Duration_hr || 4);
        
        if(!timelineGroups.get(m.Drug_ID)) timelineGroups.add({ id: m.Drug_ID, content: name, order: 1 });

        let timeStr = String(m.Time_Take || "08:00"); 
        if(timeStr.includes("T")) timeStr = timeStr.split("T")[1].substring(0, 5);
        else if (timeStr.length >= 5) timeStr = timeStr.substring(0, 5);
        else timeStr = "08:00";

        let start = new Date(`${todayStr}T${timeStr}:00`).getTime() + (onset*60000);
        let end = start + (dur*3600000);
        let mid = new Date(`${todayStr}T23:59:59`).getTime();
        let subId = m.Drug_ID; 

        let commonData = { id: m.Drug_ID, Trade_Name: name, Dose: m.Dose, onset: onset, Time_Take: timeStr, isOriginal: true };

        if(end > mid) {
            timelineItems.add({ id: `M_${Math.random()}`, group: m.Drug_ID, content: `${m.Dose}`, start: new Date(start), end: new Date(mid), className: getDrugClass(info.type), subgroup: subId, _drugData: commonData });
            timelineItems.add({ id: `M_W_${Math.random()}`, group: m.Drug_ID, content: `(ต่อ)`, start: new Date(`${todayStr}T00:00:00`), end: new Date(new Date(`${todayStr}T00:00:00`).getTime() + (end-mid)), className: getDrugClass(info.type), subgroup: subId, style: 'opacity:0.7; border-style:dashed;', _drugData: {id: m.Drug_ID, isWrapped: true } });
        } else {
            timelineItems.add({ id: `M_${Math.random()}`, group: m.Drug_ID, content: `${m.Dose}`, start: new Date(start), end: new Date(end), className: getDrugClass(info.type), subgroup: subId, _drugData: commonData });
        }
    });

    logs.forEach(l => {
        let ev = l.Event_Type || Object.values(l)[3];
        if(ev === 'OFF-Time' || ev === 'Dyskinesia') {
            try {
                let st = String(l.Start_Time || Object.values(l)[4] || "");
                let en = String(l.End_Time || Object.values(l)[5] || "");
                
                if(st.length >= 5 && en.length >= 5 && !st.includes('-') && !en.includes('-')) {
                    let s = new Date(`${todayStr}T${st.substring(0,5)}:00`);
                    let e = new Date(`${todayStr}T${en.substring(0,5)}:00`);
                    
                    if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
                        if (s.getTime() >= e.getTime()) e = new Date(e.getTime() + 86400000); 
                        
                        timelineItems.add({ 
                            id: l.Log_ID || Object.values(l)[0], 
                            group: 'symptoms', 
                            content: ev, 
                            start: s, 
                            end: e, 
                            className: ev === 'OFF-Time' ? 'log-off' : 'log-dyskinesia',
                            editable: { remove: true }
                        });
                    }
                }
            } catch(err) {
                console.warn("ข้ามข้อมูลบรรทัดที่มีปัญหา:", l);
            }
        }
    });

    timeline = new vis.Timeline(c, timelineItems, timelineGroups, {
        start: new Date(`${todayStr}T00:00:00`), 
        end: new Date(`${todayStr}T23:59:59`),
        stack: true, 
        groupOrder: 'order', 
        margin: { item: 10, axis: 5 },
        zoomable: false, 
        locale: 'th',
        showCurrentTime: false, 
        editable: { add: false, updateTime: true, remove: true },
        onRemove: (item, cb) => { 
            if(confirm("ลบข้อมูล?")) { 
                fetch(API_URL, {method:'POST', body:JSON.stringify({action:'deleteLog', Log_ID:item.id})}); 
                cb(item); 
            } else cb(null); 
        }
    });

    updateMeals(); 
}

function updateMeals() {
    const todayStr = new Date().toISOString().split('T')[0];
    const tb = document.getElementById('mealBreak').value.trim();
    const tl = document.getElementById('mealLunch').value.trim();
    const td = document.getElementById('mealDinner').value.trim();
    const showMeals = document.getElementById('toggleMeals').checked;

    try { timeline.removeCustomTime('mealBreakfast'); } catch(e){}
    try { timeline.removeCustomTime('mealLunch'); } catch(e){}
    try { timeline.removeCustomTime('mealDinner'); } catch(e){}

    if (!showMeals) return;

    const isValidTime = (t) => /^([01]\d|2[0-3]):?([0-5]\d)$/.test(t);

    if (tb && isValidTime(tb)) { timeline.addCustomTime(new Date(`${todayStr}T${tb}:00`), 'mealBreakfast'); timeline.setCustomTimeMarker('เช้า', 'mealBreakfast'); }
    if (tl && isValidTime(tl)) { timeline.addCustomTime(new Date(`${todayStr}T${tl}:00`), 'mealLunch'); timeline.setCustomTimeMarker('เที่ยง', 'mealLunch'); }
    if (td && isValidTime(td)) { timeline.addCustomTime(new Date(`${todayStr}T${td}:00`), 'mealDinner'); timeline.setCustomTimeMarker('เย็น', 'mealDinner'); }

    document.querySelectorAll('.vis-custom-time').forEach(el => {
        if(el.innerHTML.includes('เช้า')) el.classList.add('meal-breakfast');
        if(el.innerHTML.includes('เที่ยง')) el.classList.add('meal-lunch');
        if(el.innerHTML.includes('เย็น')) el.classList.add('meal-dinner');
    });
}

function saveADR() {
    let cb = document.querySelectorAll('.adr-check:checked');
    savedADRData.symptoms = []; savedADRData.advices = []; let reportDetails = [];
    
    cb.forEach(c => { 
        savedADRData.symptoms.push(c.value); reportDetails.push(c.value);
        if(c.dataset.suggest) savedADRData.advices.push(c.dataset.suggest); 
    });
    
    savedADRData.drpClass = document.getElementById('drpClass').value;
    savedADRData.note = document.getElementById('adrNote').value;
    
    if(savedADRData.drpClass) reportDetails.push("Class: " + savedADRData.drpClass);
    if(savedADRData.note) reportDetails.push("Note: " + savedADRData.note);

    bootstrap.Modal.getInstance(document.getElementById('adrModal')).hide();

    let now = new Date();
    let todayThaiStr = now.getDate() + "/" + (now.getMonth() + 1) + "/" + (now.getFullYear() + 543);

    if(reportDetails.length > 0) {
        fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'addLog', PD_No: currentPatientId, Date: todayThaiStr, Event_Type: 'DRPs/ADR Check', Start_Time: '-', End_Time: '-', Reporter: 'Pharmacist', Detail_Note: reportDetails.join(' | ') }) })
          .then(res => res.json()).then(data => alert('บันทึกข้อมูลคัดกรองลงฐานข้อมูลแล้ว')).catch(err => alert('เกิดข้อผิดพลาดในการบันทึก ADR'));
    } else alert('บันทึกข้อมูลคัดกรองแล้ว (ไม่ได้ส่งฐานข้อมูล)');
}

function analyzeRegimen() {
    let items = timelineItems.get();
    let hasOff = items.some(i => i.group === 'symptoms' && i.content === 'OFF-Time');
    let hasDys = items.some(i => i.group === 'symptoms' && i.content === 'Dyskinesia');
    let titleStr = "", bestStr = ""; let optList = [];

    if (hasOff && hasDys) {
        titleStr = "⚠️ พบทั้ง OFF-Time และ Dyskinesia";
        bestStr = "พิจารณา 'Fractionation': ลดขนาดยา L-dopa ต่อมื้อลง และเพิ่มความถี่มื้อยา";
        optList.push("เพิ่มยา Dopamine Agonist (เช่น Requip PD) หรือ Amantadine เพื่อลด Dyskinesia");
        optList.push("พิจารณาการใช้ยาในกลุ่ม COMT Inhibitor อย่างระมัดระวัง");
    } else if (hasOff) {
        titleStr = "📉 พบภาวะยาหมดฤทธิ์ก่อนกำหนด (Wearing-Off)";
        bestStr = "พิจารณาเพิ่มยา COMT Inhibitor (Comtan) หรือ MAO-B Inhibitor (Rasagiline)";
        optList.push("ขยับมื้อยา L-dopa ให้ถี่ขึ้น (Shorten Interval)");
        optList.push("เปลี่ยนรูปแบบยาเป็น Controlled Release (CR) ในมื้อก่อนนอน");
    } else if (hasDys) {
        titleStr = "📈 พบภาวะยุกยิก (Peak-Dose Dyskinesia)";
        bestStr = "ลดขนาดยา L-dopa ในมื้อที่มีอาการลง";
        optList.push("พิจารณาหยุดยา COMT Inhibitor หรือ MAO-B Inhibitor ชั่วคราว");
        optList.push("เพิ่มยา Amantadine เพื่อคุมอาการยุกยิก");
    } else {
        titleStr = "✅ ไม่พบ Motor Complications บนกราฟ";
        bestStr = "คงแผนการรักษาเดิม (Maintain Current Therapy)";
        optList.push("ติดตามอาการ Non-Motor Symptoms (NMS) เพิ่มเติม");
    }

    document.getElementById('aiTitle').innerText = titleStr; document.getElementById('aiBest').innerHTML = bestStr;
    let ul = document.getElementById('aiOptions'); ul.innerHTML = "";
    optList.forEach(opt => { let li = document.createElement('li'); li.innerHTML = opt; ul.appendChild(li); });
    document.getElementById('aiRecommendationArea').classList.remove('d-none');
}

function calculateLEDD(medsList) {
    let totalLdopa = 0;
    let breakdowns = [];

    let timeGroups = {};
    medsList.forEach(m => {
        let t = m.Time_Take || "00:00";
        if(!timeGroups[t]) timeGroups[t] = [];
        timeGroups[t].push(m);
    });

    for (let t in timeGroups) {
        let medsAtTime = timeGroups[t];
        let hasComtan = medsAtTime.some(m => {
            let n = (m.Trade_Name || m.name || "").toLowerCase();
            return n.includes('comtan') || n.includes('entacapone');
        });

        medsAtTime.forEach(m => {
            let name = (m.Trade_Name || m.name || "").toLowerCase();
            let doseStr = (m.Dose || "").toString().toLowerCase();
            
            let multiplier = 1;
            let match = doseStr.match(/([0-9]*\.?[0-9]+)/); 
            if(match) multiplier = parseFloat(match[1]);
            if(doseStr.includes('1/2') || doseStr.includes('ครึ่ง')) multiplier = 0.5;
            if(doseStr.includes('1/4')) multiplier = 0.25;

            let isLdopa = false;
            let baseDose = 0;

            if (name.includes('madopar') || name.includes('vopar')) {
                isLdopa = true;
                if (name.includes('hbs')) baseDose = 100 * 0.75; 
                else if (name.includes('125') || name.includes('100/25') || name.includes(' 100')) baseDose = 100;
                else if (name.includes('250') || name.includes('200/50')) baseDose = 200;
                else baseDose = 100; 
            } 
            else if (name.includes('sinemet') || name.includes('levodopa')) {
                isLdopa = true;
                if (name.includes('250') || name.includes('200/50')) baseDose = 250;
                else if (name.includes('125') || name.includes('100/25') || name.includes('100')) baseDose = 100;
                else if (name.includes('cr')) baseDose = 200 * 0.75; 
                else baseDose = 100; 
            }
            else if (name.includes('stalevo')) {
                let stBase = 0;
                if (name.includes('50')) stBase = 50;
                else if (name.includes('100')) stBase = 100;
                else if (name.includes('150')) stBase = 150;
                else if (name.includes('200')) stBase = 200;
                
                if (stBase > 0) {
                    let finalDose = Math.round(stBase * 1.33 * multiplier);
                    totalLdopa += finalDose;
                    breakdowns.push(finalDose);
                }
            }

            if (isLdopa && baseDose > 0) {
                let finalDose = baseDose * multiplier;
                if (hasComtan) {
                    finalDose = finalDose * 1.33;
                }
                finalDose = Math.round(finalDose); 
                totalLdopa += finalDose;
                breakdowns.push(finalDose);
            }
        });
    }

    return { 
        ldopa: Math.round(totalLdopa), 
        breakdown: breakdowns.length > 0 ? breakdowns.join(" + ") : "0" 
    };
}

function printSystem() {
    let now = new Date();
    let todayThaiStr = now.getDate() + "/" + (now.getMonth() + 1) + "/" + (now.getFullYear() + 543);
    
    // แอบส่ง Log เข้า Database เพื่อใช้เป็นตัวนับยอด Visit ของคลินิก
    fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({
            action: 'addLog',
            PD_No: currentPatientId,
            Date: todayThaiStr,
            Event_Type: 'Clinic_Visit',
            Start_Time: '-',
            End_Time: '-',
            Reporter: 'Pharmacist',
            Detail_Note: 'เข้ารับบริการ/ปรินต์ใบสรุปแผนการรักษา'
        })
    });

    const today = new Date().toISOString().split('T')[0];
    timeline.setWindow(new Date(`${today}T00:00:00`), new Date(`${today}T23:59:59`), { animation: false });
    
    generateReport();
    document.getElementById('reportArea').classList.remove('d-none');

    let viz = document.querySelector('#visualization');
    let originalW = viz.style.width; let originalH = viz.style.height;
    
    viz.style.width = "1800px"; 
    viz.style.height = "700px"; 
    timeline.redraw();

    setTimeout(() => {
        html2canvas(viz, { scale: 2, logging: false }).then(canvas => {
            viz.style.width = originalW; viz.style.height = originalH; timeline.redraw();
            document.getElementById('graph-snapshot').src = canvas.toDataURL("image/png");
        });
    }, 800); 
}

function generateReport() {
    let all = timelineItems.get();
    let meds = {}; 
    let newMedsList = []; 
    let offMs = 0, dysMs = 0;
    
    all.forEach(i => {
        if(i.group !== 'symptoms' && i._drugData && i._drugData.isOriginal) {
            let time = i._drugData.Time_Take || "00:00";
            if(!meds[i._drugData.Trade_Name]) meds[i._drugData.Trade_Name] = [];
            meds[i._drugData.Trade_Name].push(`<b>${i._drugData.Dose}</b> (${time})`);
            
            newMedsList.push({Trade_Name: i._drugData.Trade_Name, Dose: i._drugData.Dose, Time_Take: time});
        }
        if(i.content === 'OFF-Time') offMs += (i.end - i.start);
        if(i.content === 'Dyskinesia') dysMs += (i.end - i.start);
    });

    let newDoseObj = calculateLEDD(newMedsList);

    let html = `<div class="print-row"><div class="print-col-left">`;
    
    if(offMs > 0 || dysMs > 0) {
        let offH = (offMs/3600000).toFixed(1); let dysH = (dysMs/3600000).toFixed(1);
        let offPct = ((offH/16)*100).toFixed(1); let dysPct = ((dysH/16)*100).toFixed(1);
        let offSev = offPct<=25?"เล็กน้อย":(offPct<=50?"ปานกลาง":"รุนแรง");
        let dysSev = dysPct<=25?"เล็กน้อย":(dysPct<=50?"ปานกลาง":"รุนแรง");

        html += `<div class="report-header text-primary">📊 Motor Fluctuations:</div><ul>`;
        if(offMs) html += `<li>Wearing-off: ${offH} ชม. (${offPct}% - ${offSev})</li>`;
        if(dysMs) html += `<li>Dyskinesia: ${dysH} ชม. (${dysPct}% - ${dysSev})</li>`;
        html += `</ul>`;
    }

    html += `<div class="report-header text-success">📌 แผนการจัดตารางยาใหม่:</div><ul style="margin-bottom: 2px;">`;
    for(let k in meds) html += `<li><strong>${k}</strong>: ${meds[k].sort().join(', ')}</li>`;
    
    if(newDoseObj.ldopa > 0) {
        html += `<li class="mt-2 text-primary" style="list-style-type: none; margin-left: -20px; font-size: 11px;">
            <strong>💊 Total Levodopa Dose:</strong> <b>${newDoseObj.ldopa} mg/day</b>
            <span class="badge bg-secondary ms-2 no-print" style="cursor:pointer;" onclick="document.getElementById('ledd-breakdown').classList.toggle('d-none')">🔍 ดูการคำนวณ</span>
            <div id="ledd-breakdown" class="d-none text-muted mt-1" style="font-size: 10px;">
                <i>วิธีคิด: ${newDoseObj.breakdown} = ${newDoseObj.ldopa} mg</i>
            </div>
        </li>`;
    }
    html += `</ul>`;

    html += `<div class="report-header text-danger mt-2">⚠️ DRPs [${savedADRData.drpClass}]:</div>`;
    if(savedADRData.symptoms.length > 0) {
        html += `<ul>${savedADRData.symptoms.map(s => `<li>[X] ${s}</li>`).join('')}</ul>`;
    } else {
        html += `<p>- ไม่พบปัญหา DRPs</p>`;
    }
    html += `</div>`;

    html += `<div class="print-col-right">`;
    let interventions = [];
    let hasFoodInt = savedADRData.symptoms.some(s => s.includes("ทานยาก่อนอาหาร"));
    let hasNgTube = savedADRData.symptoms.some(s => s.includes("บริหารยาทางสายยาง"));
    let hasPostural = savedADRData.symptoms.some(s => s.includes("ทรงตัวลำบาก"));
    
    if (hasNgTube && Object.keys(meds).some(m => m.includes("HBS") || m.includes("PD 24h"))) interventions.push(`🚨 <b>[CRITICAL]</b> ห้ามบดยา CR (HBS, PD 24h) ในผู้ป่วย NG Tube เปลี่ยนเป็น IR/Dispersible`);
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


// =========================================================================
// 🌟🌟🌟 ระบบแปลงวันที่อัจฉริยะ (แปลเป็นตัวเลข YYYYMMDD เพื่อลบปัญหา พ.ศ./ค.ศ. ทิ้งถาวร)
// =========================================================================
function getSortableDateInt(dateStr) {
    if(!dateStr) return 0;
    let str = String(dateStr).trim();
    let d = 0, m = 0, y = 0;

    // กรณีอ่านจาก Google Sheet เช่น "21/2/2569" หรือ "2/21/2026"
    if(str.includes('/')) {
        let parts = str.split(' ')[0].split('/');
        if (parts.length >= 3) {
            let p0 = parseInt(parts[0], 10);
            let p1 = parseInt(parts[1], 10);
            let p2 = parseInt(parts[2], 10);

            if (p2 > 1000) { // เป็น DD/MM/YYYY
                y = p2;
                if (p0 > 12) { d = p0; m = p1; } // หน้าเป็นวัน หลังเป็นเดือน
                else if (p1 > 12) { m = p0; d = p1; } // หน้าเป็นเดือน หลังเป็นวัน
                else { d = p0; m = p1; } // ค่ามาตรฐานไทย
            } else { // เป็น YYYY/MM/DD
                y = p0;
                m = p1;
                d = p2;
            }
        }
    } 
    // กรณีอ่านจากช่องเลือกปฏิทิน เช่น "2026-02-21" หรือ "2569-02-21"
    else if(str.includes('-')) {
        let parts = str.split(' ')[0].split('-');
        if (parts.length >= 3) {
            y = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10);
            d = parseInt(parts[2], 10);
        }
    }

    // บังคับแปลงเป็น ค.ศ. เพื่อให้ตัวเลขเอาไปเทียบกันได้เสมอ
    if(y > 2500) y -= 543; 
    
    if(isNaN(y) || isNaN(m) || isNaN(d) || y === 0) return 0;
    
    // แปลงออกมาเป็นตัวเลข 8 หลัก เช่น 20260221
    return (y * 10000) + (m * 100) + d;
}

// 🌟 ระบบ KPI อัปเกรดใหม่ (เปรียบเทียบจากตัวเลขตรงๆ 100% แม่นยำ) 🌟
async function fetchKPIReport() {
    let startInput = document.getElementById('kpiStart').value;
    let endInput = document.getElementById('kpiEnd').value;
    if(!startInput || !endInput) return alert("กรุณาเลือกวันที่เริ่มและสิ้นสุด");

    // แปลงวันที่หน้าเว็บให้กลายเป็นตัวเลข
    let startInt = getSortableDateInt(startInput);
    let endInt = getSortableDateInt(endInput);

    if(startInt === 0 || endInt === 0) return alert("รูปแบบวันที่ไม่ถูกต้อง");

    try {
        document.getElementById('kpiResult').value = "⏳ กำลังดึงข้อมูลและประมวลผล... โปรดรอสักครู่";
        const res = await fetch(`${API_URL}?action=getKPIReport`);
        const data = await res.json();
        
        let targetLogs = data.logs.filter(l => {
            // ดึงวันที่จาก Sheet แล้วแปลงเป็นตัวเลข
            let dateVal = l.Date || l.date || l['วันที่'] || l[' Date'] || l['Date '] || Object.values(l)[2];
            let logInt = getSortableDateInt(dateVal);
            
            // นำตัวเลขมาเทียบกันตรงๆ (ไม่ต้องพึ่งพาระบบเวลาของคอมพิวเตอร์)
            return logInt >= startInt && logInt <= endInt;
        });
        
        if (targetLogs.length === 0) {
            let sampleDate = data.logs.length > 0 ? (data.logs[data.logs.length-1].Date || Object.values(data.logs[data.logs.length-1])[2]) : "ไม่มีประวัติในระบบ";
            document.getElementById('kpiResult').value = `⚠️ ไม่พบข้อมูลในช่วงเวลาที่คุณหมอเลือกครับ\n\n--- ข้อมูลสำหรับการตรวจสอบ ---\nประวัติล่าสุดใน Sheet คือวันที่: ${sampleDate}\nรูปแบบวันที่กำลังค้นหา: ${startInput} ถึง ${endInput}`;
            return;
        }

        let clinicVisitsMap = new Set(); 
        let liffVisitsMap = new Set();   
        let uniquePatientsAny = new Set(); 
        
        let cMotorStats = { off: new Set(), dys: new Set(), delOn: new Set(), mornAki: new Set() };
        let cDrpStats = { any: new Set(), adr: new Set(), nc: new Set(), nd: new Set(), di: new Set(), multiple: new Set() };
        let cAdrDetails = { ortho: 0, fall: 0, nvd: 0, hal: 0, insom: 0, constip: 0, eds: 0 };

        targetLogs.forEach(l => {
            let pd = String(l.PD_No || l.pd_no || l['HN'] || Object.values(l)[1] || "");
            let ev = String(l.Event_Type || l.event_type || l['ประเภท'] || Object.values(l)[3] || "");
            let note = String(l.Detail_Note || l.detail_note || l['รายละเอียด'] || Object.values(l)[7] || "");
            let rep = String(l.Reporter || l.reporter || l['ผู้บันทึก'] || Object.values(l)[6] || "");
            let dateVal = String(l.Date || l.date || l['วันที่'] || Object.values(l)[2] || "");
            let pd_date = pd + "|" + dateVal;

            if(!pd) return; 
            uniquePatientsAny.add(pd);

            if (ev.includes('Clinic_Visit') || ev.includes('DRPs') || note.includes('เข้ารับบริการ') || rep.includes('Pharmacist')) {
                clinicVisitsMap.add(pd_date);
            }
            if (ev.includes('LIFF') || rep.includes('Patient')) {
                liffVisitsMap.add(pd_date);
            }

            if (ev.includes('OFF') || note.includes('Wearing-off') || note.includes('OFF-Time')) cMotorStats.off.add(pd);
            if (ev.includes('Dys') || note.includes('Dyskinesia')) cMotorStats.dys.add(pd);
            if (note.includes('Delayed ON') || note.includes('ออกฤทธิ์ช้า')) cMotorStats.delOn.add(pd);
            if (note.includes('Morning Akinesia') || note.includes('ตื่นเช้ามา')) cMotorStats.mornAki.add(pd);

            if (note.includes('Class: ')) {
                cDrpStats.any.add(pd);
                if(note.includes('Adverse drug reaction') || note.includes('ADR')) cDrpStats.adr.add(pd);
                if(note.includes('Non-Compliance') || note.includes('NC')) cDrpStats.nc.add(pd);
                if(note.includes('Need for additional') || note.includes('ND')) cDrpStats.nd.add(pd);
                if(note.includes('Drug interaction') || note.includes('DI')) cDrpStats.di.add(pd);
                if(note.includes('พบหลายปัญหา')) cDrpStats.multiple.add(pd);
            }

            if (note.includes('หน้ามืด') || note.includes('วูบ')) cAdrDetails.ortho++;
            if (note.includes('หกล้ม') || note.includes('ทรงตัวไม่อยู่')) cAdrDetails.fall++;
            if (note.includes('คลื่นไส้') || note.includes('อาเจียน')) cAdrDetails.nvd++;
            if (note.includes('ภาพหลอน') || note.includes('สับสน')) cAdrDetails.hal++;
            if (note.includes('นอนไม่หลับ') || note.includes('ละเมอ') || note.includes('ฝันร้าย')) cAdrDetails.insom++;
            if (note.includes('ท้องผูก')) cAdrDetails.constip++;
            if (note.includes('ง่วงซึม')) cAdrDetails.eds++;
        });
        
        let totalPatients = uniquePatientsAny.size;
        let getPct = (count) => totalPatients > 0 ? ((count/totalPatients)*100).toFixed(1) : 0;

        let resultTxt = `รายงานตัวชี้วัดผลการปฏิบัติงาน คลินิกพาร์กินสัน (Pharmacist KPI)\n`;
        resultTxt += `วันที่ประเมิน: ${startInput} ถึง ${endInput}\n`;
        resultTxt += `==============================================\n\n`;
        
        resultTxt += `1. สถิติการรับบริการ (Service Workload)\n`;
        resultTxt += `   - จำนวนผู้ป่วยที่เข้ารับบริการทั้งหมด (Unique Patients): ${totalPatients} ราย\n`;
        resultTxt += `   - จำนวนครั้งที่มารับบริการที่คลินิก (Clinic Visits): ${clinicVisitsMap.size} ครั้ง\n`;
        resultTxt += `   - จำนวนครั้งที่ผู้ป่วยประเมินผ่าน LINE OA: ${liffVisitsMap.size} ครั้ง\n\n`;
        
        let totalMotor = new Set([...cMotorStats.off, ...cMotorStats.dys, ...cMotorStats.delOn, ...cMotorStats.mornAki]).size;
        resultTxt += `2. ปัญหาความผิดปกติทางการเคลื่อนไหว (Motor Complications)\n`;
        resultTxt += `   - พบผู้ป่วยที่มีอาการรวม: ${totalMotor} ราย (${getPct(totalMotor)}%)\n`;
        resultTxt += `       > Wearing-off: ${cMotorStats.off.size} ราย\n`;
        resultTxt += `       > Dyskinesia: ${cMotorStats.dys.size} ราย\n`;
        resultTxt += `       > Delayed ON: ${cMotorStats.delOn.size} ราย\n`;
        resultTxt += `       > Morning Akinesia: ${cMotorStats.mornAki.size} ราย\n\n`;

        resultTxt += `3. ปัญหาที่เกี่ยวเนื่องกับยา (Drug-Related Problems: DRPs)\n`;
        resultTxt += `   - พบผู้ป่วยที่มีปัญหาด้านยารวม: ${cDrpStats.any.size} ราย (${getPct(cDrpStats.any.size)}%)\n`;
        resultTxt += `       > ความไม่ร่วมมือในการใช้ยา (Non-compliance): ${cDrpStats.nc.size} ราย\n`;
        resultTxt += `       > ความจำเป็นต้องได้รับยาเพิ่ม (Need additional): ${cDrpStats.nd.size} ราย\n`;
        resultTxt += `       > อันตรกิริยาระหว่างยาและอาหาร (Drug-Food Int.): ${cDrpStats.di.size} ราย\n`;
        resultTxt += `       > อาการไม่พึงประสงค์จากการใช้ยา (ADR): ${cDrpStats.adr.size} ราย\n`;
        resultTxt += `       > ปัญหาซับซ้อนหลายหมวดหมู่: ${cDrpStats.multiple.size} ราย\n\n`;

        resultTxt += `4. รายละเอียดอาการไม่พึงประสงค์ (ADRs Checklist Details)\n`;
        resultTxt += `   - หน้ามืด/ความดันตกขณะเปลี่ยนท่า: ${cAdrDetails.ortho} ครั้ง\n`;
        resultTxt += `   - มีประวัติหกล้ม ทรงตัวไม่อยู่: ${cAdrDetails.fall} ครั้ง\n`;
        resultTxt += `   - คลื่นไส้/อาเจียน: ${cAdrDetails.nvd} ครั้ง\n`;
        resultTxt += `   - เห็นภาพหลอน/สับสน: ${cAdrDetails.hal} ครั้ง\n`;
        resultTxt += `   - ท้องผูกรุนแรง: ${cAdrDetails.constip} ครั้ง\n`;
        resultTxt += `   - ง่วงซึมมากช่วงกลางวัน (EDS): ${cAdrDetails.eds} ครั้ง\n`;
        resultTxt += `   - นอนไม่หลับ ฝันร้าย ละเมอ: ${cAdrDetails.insom} ครั้ง\n`;

        document.getElementById('kpiResult').value = resultTxt;
    } catch(e) { alert("ดึงข้อมูลล้มเหลว โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต"); }
}

function exportKPIExcel() {
    let text = document.getElementById('kpiResult').value;
    if(!text || text.includes('กำลังดึงข้อมูล') || text.includes('ไม่พบข้อมูล')) return alert("กรุณาดึงข้อมูลให้เสร็จก่อนส่งออก");

    let rows = text.split('\n').map(r => `<tr><td style="font-family: 'Sarabun', sans-serif;">${r}</td></tr>`).join('');
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table>${rows}</table></body></html>`;

    let blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement("a");
    a.href = url;
    a.download = `KPI_Parkinson_${new Date().toISOString().slice(0,10)}.xls`;
    a.click();
}

function addSimulatedMed() { const d=document, i=d.getElementById('simDrug').value, o=d.getElementById('simDose').value, t=d.getElementById('simTime').value; if(!t)return; const inf=drugMaster.find(x=>x.id===i); const td=new Date().toISOString().split('T')[0]; const s=new Date(td+'T'+t+':00').getTime()+(inf.onset*60000); const e=s+(inf.duration*3600000); const mid=new Date(td+'T23:59:59').getTime(); if(!timelineGroups.get(i)) timelineGroups.add({id:i, content:inf.name, order:1}); let sub=i; let commonData = {id:i, Trade_Name:inf.name, Dose:o, onset:inf.onset, Time_Take:t, isOriginal:true}; if(e>mid) { timelineItems.add({id:`M_${Math.random()}`, group:i, content:o, start:new Date(s), end:new Date(mid), className:getDrugClass(inf.type), subgroup:sub, _drugData:commonData}); timelineItems.add({id:`M_W_${Math.random()}`, group:i, content:'(ต่อ)', start:new Date(td+'T00:00:00'), end:new Date(new Date(td+'T00:00:00').getTime()+(e-mid)), className:getDrugClass(inf.type), subgroup:sub, style:'opacity:0.7;border-style:dashed;', _drugData:{id:i, isWrapped:true}}); } else { timelineItems.add({id:`M_${Math.random()}`, group:i, content:o, start:new Date(s), end:new Date(e), className:getDrugClass(inf.type), subgroup:sub, _drugData:commonData}); } }
function addManualSymptom() { 
    let type = document.getElementById('symType').value; 
    let startStr = document.getElementById('symStart').value; 
    let endStr = document.getElementById('symEnd').value; 
    if(!startStr || !endStr) return alert("กรุณาระบุเวลาให้ครบ"); 
    
    let now = new Date();
    let todayThaiStr = now.getDate() + "/" + (now.getMonth() + 1) + "/" + (now.getFullYear() + 543);
    
    let payload = { action: 'addLog', PD_No: currentPatientId, Date: todayThaiStr, Event_Type: type, Start_Time: startStr, End_Time: endStr, Reporter: 'Pharmacist', Detail_Note: "Manual Input" }; 
    fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) }).then(res => res.json()).then(data => { 
        if(data.status === 'success') { 
            let todayStr = new Date().toISOString().split('T')[0]; 
            timelineItems.add({ id: data.logId || `L_${Math.random()}`, group: 'symptoms', content: type, start: new Date(`${todayStr}T${startStr}:00`), end: new Date(`${todayStr}T${endStr}:00`), className: type === 'OFF-Time' ? 'log-off' : 'log-dyskinesia', editable: { remove: true } }); 
            document.getElementById('symStart').value = ""; 
            document.getElementById('symEnd').value = ""; 
        } else { alert("บันทึกล้มเหลว: " + data.message); } 
    }).catch(err => alert("เกิดข้อผิดพลาดในการบันทึกอาการ")); 
}
function archiveOldLogs() { if(confirm("ล้างกราฟ?")) { fetch(API_URL, {method:'POST', body:JSON.stringify({action:'archiveLogs', PD_No:currentPatientId})}).then(()=>loadPatientData()); } }
function saveMedsToDB() { if(confirm("บันทึกยา?")) { let m=[]; timelineItems.get().forEach(i=>{ if(i.group!=='symptoms' && i._drugData?.isOriginal) m.push({Drug_ID:i._drugData.id, Dose:i._drugData.Dose, Time_Take:i._drugData.Time_Take||"08:00"}); }); fetch(API_URL, {method:'POST', body:JSON.stringify({action:'updatePatientMeds', PD_No:currentPatientId, meds:m})}).then(()=>alert("บันทึกแล้ว")); } }

function showNewPatientModal() {
    document.getElementById('npName').value = "";
    document.getElementById('npAge').value = "";
    document.getElementById('npHN').value = "";
    document.getElementById('npPhone').value = "";
    let modal = new bootstrap.Modal(document.getElementById('newPatientModal'));
    modal.show();
}

async function saveNewPatient() {
    let name = document.getElementById('npName').value.trim();
    let age = document.getElementById('npAge').value.trim();
    let hn = document.getElementById('npHN').value.trim();
    let phone = document.getElementById('npPhone').value.trim();

    if (!name || !age || !hn || !phone) return alert("⚠️ กรุณากรอกข้อมูลให้ครบถ้วนทุกช่องครับ");

    let btn = document.getElementById('btnSavePatient');
    btn.innerHTML = "⏳ กำลังบันทึก...";
    btn.disabled = true;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'createNewPatient', name: name, age: age, hn: "'" + hn, phone: "'" + phone })
        });
        const data = await response.json();
        
        if (data.status === 'success') {
            alert(`✅ สร้างโปรไฟล์สำเร็จ!\nรหัสพาร์กินสันของคนไข้คือ: ${data.pd_no}`);
            bootstrap.Modal.getInstance(document.getElementById('newPatientModal')).hide();
            document.getElementById('pdInput').value = hn;
            loadPatientData(); 
        } else alert("❌ เกิดข้อผิดพลาด: " + data.message);
    } catch (e) {
        alert("❌ การเชื่อมต่อล้มเหลว กรุณาตรวจสอบอินเทอร์เน็ต");
    } finally {
        btn.innerHTML = "💾 บันทึกข้อมูล";
        btn.disabled = false;
    }
}

function showPatientDrugsModal() {
    let container = document.getElementById('patientDrugsContainer');
    let currentMeds = [];
    timelineItems.get().forEach(i => {
        if (i.group !== 'symptoms' && i._drugData && i._drugData.isOriginal) {
            if (!currentMeds.includes(i._drugData.id)) currentMeds.push(i._drugData.id);
        }
    });

    if (currentMeds.length === 0) {
        container.innerHTML = '<p class="text-center text-muted my-4">ไม่พบรายการยาที่ผู้ป่วยกำลังทาน (กราฟว่างเปล่า)</p>';
    } else {
        let html = "";
        currentMeds.forEach(drugId => {
            let drugInfo = drugMaster.find(d => d.id === drugId);
            if (drugInfo) {
                let pillImg = drugInfo.pill_image || "https://cdn-icons-png.flaticon.com/512/822/822092.png";
                let packImg = drugInfo.pack_image; 
                let imagesHtml = `<img src="${pillImg}" class="drug-img shadow-sm" alt="เม็ดยา">`;
                if (packImg) imagesHtml += `<img src="${packImg}" class="drug-img shadow-sm" alt="แผงยา">`;

                html += `
                <div class="drug-card shadow-sm">
                    <div class="d-flex align-items-center me-3">
                        ${imagesHtml}
                    </div>
                    <div>
                        <h6 class="mb-1 fw-bold text-dark">${drugInfo.name}</h6>
                        <small class="text-muted">รหัสยา: ${drugInfo.id} | ชนิด: ${drugInfo.type}</small>
                    </div>
                </div>`;
            }
        });
        container.innerHTML = html;
    }
    let modal = new bootstrap.Modal(document.getElementById('patientDrugsModal'));
    modal.show();
}
