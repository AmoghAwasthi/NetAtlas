const table=document.getElementById("deviceTable");
const onlineCount=document.getElementById("onlineCount");
const totalCount=document.getElementById("totalCount");
const subnet=document.getElementById("subnet");
const status=document.getElementById("connectionStatus");
const lastUpdate=document.getElementById("lastUpdate");
const scanButton=document.getElementById("scanButton");

function renderDevices(devices){
  onlineCount.textContent=devices.filter(d=>d.is_online).length;
  totalCount.textContent=devices.length;
  table.innerHTML=devices.map(d=>`
    <tr class="${d.is_online?"":"offline"}">
      <td><span class="dot"></span>${d.is_online?"Online":"Offline"}</td>
      <td>${d.ip_address}</td>
      <td>${d.mac_address??"—"}</td>
      <td>${d.hostname??"Unknown"}</td>
      <td>${new Date(d.last_seen).toLocaleString()}</td>
    </tr>`).join("");
}

async function loadInitialData(){
  const [devicesResponse,networkResponse]=await Promise.all([
    fetch("/api/devices"),fetch("/api/network")
  ]);
  renderDevices(await devicesResponse.json());
  subnet.textContent=(await networkResponse.json()).subnet;
}

function connectWebSocket(){
  const protocol=location.protocol==="https:"?"wss":"ws";
  const socket=new WebSocket(`${protocol}://${location.host}/ws`);
  socket.onopen=()=>status.textContent="Live";
  socket.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.type==="network_update"){
      subnet.textContent=message.subnet;
      renderDevices(message.devices);
      lastUpdate.textContent=`Updated ${new Date().toLocaleTimeString()}`;
    }
    if(message.type==="error"){
      status.textContent="Discovery error";
      lastUpdate.textContent=message.message;
    }
  };
  socket.onclose=()=>{
    status.textContent="Disconnected — reconnecting...";
    setTimeout(connectWebSocket,2000);
  };
}

scanButton.onclick=async()=>{
  scanButton.disabled=true; lastUpdate.textContent="Scanning LAN...";
  try{await fetch("/api/scan",{method:"POST"});}
  catch(e){lastUpdate.textContent=e.message;}
  finally{scanButton.disabled=false;}
};

loadInitialData().catch(console.error);
connectWebSocket();
