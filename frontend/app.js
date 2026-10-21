const table = document.getElementById("deviceTable");
const onlineCount = document.getElementById("onlineCount");
const totalCount = document.getElementById("totalCount");
const subnet = document.getElementById("subnet");
const status = document.getElementById("connectionStatus");
const lastUpdate = document.getElementById("lastUpdate");
const scanButton = document.getElementById("scanButton");

const graph = document.getElementById("topologyGraph");
const deviceDetails = document.getElementById("deviceDetails");
const eventMessage = document.getElementById("eventMessage");
const eventList = document.getElementById("eventList");

let allDevices = [];
let gatewayIp = null;
let localIp = null;
let previousOnlineIps = null;
let socket = null;
let reconnectTimer = null;

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function getOnlineDevices() {
    return allDevices.filter(device => device.is_online);
}

function renderDevices() {
    const onlineDevices = getOnlineDevices();

    onlineCount.textContent = onlineDevices.length;
    totalCount.textContent = allDevices.length;

    if (!onlineDevices.length) {
        table.innerHTML = `
            <tr><td colspan="5">No online devices discovered.</td></tr>
        `;
        return;
    }

    table.innerHTML = onlineDevices.map(device => `
        <tr>
            <td><span class="dot"></span>Online</td>
            <td>${escapeHtml(device.ip_address)}</td>
            <td>${escapeHtml(device.mac_address || "Unknown")}</td>
            <td>${escapeHtml(device.hostname || "Unknown")}</td>
            <td>${new Date(device.last_seen).toLocaleString()}</td>
        </tr>
    `).join("");
}

async function loadInitialData() {
    const [devicesResponse, networkResponse] = await Promise.all([
        fetch("/api/devices"),
        fetch("/api/network")
    ]);

    if (!devicesResponse.ok || !networkResponse.ok) {
        throw new Error("Could not load initial network information.");
    }

    allDevices = await devicesResponse.json();

    const network = await networkResponse.json();

    subnet.textContent = network.subnet || "Unknown";
    gatewayIp = network.gateway_ip || null;
    localIp = network.local_ip || null;

    previousOnlineIps = new Set(
        getOnlineDevices().map(device => device.ip_address)
    );

    renderDevices();
    renderTopology();
}

function addEvent(text) {
    eventMessage.textContent = text;

    const item = document.createElement("li");
    item.textContent = `${new Date().toLocaleTimeString()} - ${text}`;

    eventList.prepend(item);

    // Keep the latest 20 events visible.
    while (eventList.children.length > 20) {
        eventList.lastElementChild.remove();
    }
}

function detectDeviceChanges(devices) {
    const currentIps = new Set(
        devices
            .filter(device => device.is_online)
            .map(device => device.ip_address)
    );

    // The initial scan establishes a baseline.
    if (previousOnlineIps === null) {
        previousOnlineIps = currentIps;
        return;
    }

    for (const ip of currentIps) {
        if (!previousOnlineIps.has(ip)) {
            const device = devices.find(
                item => item.ip_address === ip
            );

            addEvent(
                `Device joined: ${device?.hostname || ip} (${ip})`
            );
        }
    }

    for (const ip of previousOnlineIps) {
        if (!currentIps.has(ip)) {
            addEvent(`Device left: ${ip}`);
        }
    }

    previousOnlineIps = currentIps;
}

function renderTopology() {
    if (!graph) return;

    graph.innerHTML = "";

    const onlineDevices = getOnlineDevices();

    const width = 900;
    const height = 520;
    const center = { x: width / 2, y: height / 2 };

    // Avoid displaying the gateway twice if ARP also discovered it.
    const gatewayDevice = onlineDevices.find(
        device => device.ip_address === gatewayIp
    );

    const clients = onlineDevices.filter(
        device => device.ip_address !== gatewayIp
    );

    const nodes = [];

    if (gatewayIp) {
        nodes.push({
            id: "gateway",
            ip: gatewayIp,
            name: gatewayDevice?.hostname || "Default Gateway",
            type: "gateway",
            device: gatewayDevice || null,
            x: center.x,
            y: center.y
        });
    }

    const radius = clients.length <= 2
        ? 190
        : Math.min(210, Math.max(150, clients.length * 28));

   
    clients.forEach((device, index) => {
        let angle;

        if (clients.length === 1) {
            angle = -Math.PI / 2;
        } else if (clients.length === 2) {
            // Place two devices on opposite sides.
            angle = index * Math.PI;
        } else {
            // Distribute three or more devices evenly.
            angle =
                (2 * Math.PI * index / clients.length)
                - Math.PI / 2;
        }

        nodes.push({
            id: `device-${device.id}`,
            ip: device.ip_address,
            name: device.hostname || device.ip_address,
            type: "device",
            device,
            x: center.x + radius * Math.cos(angle),
            y: center.y + radius * Math.sin(angle)
        });
    });


    // If gateway detection fails, draw an inferred local-network
    // hub rather than claiming to know the real gateway.
    if (!gatewayIp) {
        nodes.unshift({
            id: "inferred-hub",
            ip: null,
            name: "Local Network",
            type: "inferred",
            device: null,
            x: center.x,
            y: center.y
        });

        const fallbackDevices = nodes.slice(1);

      fallbackDevices.forEach((node, index) => {
          let angle;

          if (fallbackDevices.length === 1) {
              angle = -Math.PI / 2;
          } else if (fallbackDevices.length === 2) {
              angle = index * Math.PI;
          } else {
              angle =
                  (2 * Math.PI * index / fallbackDevices.length)
                  - Math.PI / 2;
          }

          node.x = center.x + radius * Math.cos(angle);
          node.y = center.y + radius * Math.sin(angle);
      });
    }

    const hub = nodes.find(
        node => node.type === "gateway" || node.type === "inferred"
    );

    // Draw links first so that they appear behind the nodes.
    if (hub) {
        nodes
            .filter(node => node !== hub)
            .forEach(node => {
                const line = document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "line"
                );

                line.setAttribute("x1", hub.x);
                line.setAttribute("y1", hub.y);
                line.setAttribute("x2", node.x);
                line.setAttribute("y2", node.y);
                line.setAttribute("class", "topology-link");

                graph.appendChild(line);
            });
    }

    nodes.forEach(node => {
        const group = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "g"
        );

        group.setAttribute("class", `topology-node ${node.type}`);
        group.setAttribute("transform", `translate(${node.x},${node.y})`);

        const circle = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "circle"
        );

        circle.setAttribute("r", node.type === "gateway" ? 39 : 29);
        group.appendChild(circle);

        const label = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text"
        );

        label.setAttribute("text-anchor", "middle");
        label.setAttribute("y", "5");
        label.textContent = node.type === "gateway"
            ? "GW"
            : node.type === "inferred" ? "LAN" : "PC";

        group.appendChild(label);

        const name = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text"
        );

        name.setAttribute("text-anchor", "middle");
        name.setAttribute("y", "48");
        name.setAttribute("class", "topology-label");
        name.textContent = node.name;

        group.appendChild(name);

        const ipLabel = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text"
        );

        ipLabel.setAttribute("text-anchor", "middle");
        ipLabel.setAttribute("y", "65");
        ipLabel.setAttribute("class", "topology-ip");
        ipLabel.textContent = node.ip || "";

        group.appendChild(ipLabel);

        group.addEventListener("click", () => showDeviceDetails(node));

        graph.appendChild(group);
    });

    if (!hub) {
        graph.innerHTML = `
            <text x="450" y="260" text-anchor="middle">
                No devices discovered yet.
            </text>
        `;
    }
}

function showDeviceDetails(node) {
    if (!node.device && node.type === "inferred") {
        deviceDetails.innerHTML = `
            <p><strong>Local Network</strong></p>
            <p>Gateway could not be identified.</p>
            <p>Subnet: ${escapeHtml(subnet.textContent)}</p>
            <p>Connections shown are inferred.</p>
        `;
        return;
    }

    if (!node.device) {
        deviceDetails.innerHTML = `
            <p><strong>${escapeHtml(node.name)}</strong></p>
            <p>IP: ${escapeHtml(node.ip)}</p>
            <p>Role: Default gateway, if the detected address is correct.</p>
            <p>The gateway did not respond to ARP discovery.</p>
        `;
        return;
    }

    const device = node.device;

    deviceDetails.innerHTML = `
        <p><strong>${escapeHtml(device.hostname || "Unknown device")}</strong></p>
        <p>IP address: ${escapeHtml(device.ip_address)}</p>
        <p>MAC address: ${escapeHtml(device.mac_address || "Unknown")}</p>
        <p>Device type: ${escapeHtml(device.device_type || "Unknown")}</p>
        <p>Status: ${device.is_online ? "Online" : "Offline"}</p>
        <p>First seen: ${new Date(device.first_seen).toLocaleString()}</p>
        <p>Last seen: ${new Date(device.last_seen).toLocaleString()}</p>
    `;
}

function connectWebSocket() {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${protocol}://${location.host}/ws`);

    socket.onopen = () => {
        status.textContent = "Live";
    };

    socket.onmessage = event => {
        const message = JSON.parse(event.data);

        if (message.type === "network_update") {
            allDevices = message.devices;
            subnet.textContent = message.subnet || "Unknown";
            gatewayIp = message.gateway_ip || null;
            localIp = message.local_ip || null;

            detectDeviceChanges(allDevices);
            renderDevices();
            renderTopology();

            lastUpdate.textContent =
                `Updated ${new Date().toLocaleTimeString()}`;
        }

        if (message.type === "error") {
            status.textContent = "Discovery error";
            lastUpdate.textContent = message.message;
        }
    };

    socket.onclose = () => {
        status.textContent = "Disconnected - reconnecting...";
        if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connectWebSocket();
            }, 2000);
        }
    };
}

scanButton.onclick = async () => {
    scanButton.disabled = true;
    lastUpdate.textContent = "Scanning LAN...";

    try {
        const response = await fetch("/api/scan", {
            method: "POST"
        });

        if (!response.ok) {
            throw new Error("Network scan failed.");
        }
    } catch (error) {
        lastUpdate.textContent = error.message;
    } finally {
        scanButton.disabled = false;
    }
};

loadInitialData()
    .then(connectWebSocket)
    .catch(error => {
        console.error(error);
        status.textContent = "Initialization failed";
    });