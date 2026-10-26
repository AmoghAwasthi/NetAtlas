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

    let currentMode = "LIVE";

async function switchMode(mode) {
    const liveDashboard = document.getElementById("liveDashboard");
    const simulationDashboard = document.getElementById("simulationDashboard");

    const liveButton = document.getElementById("liveModeBtn");
    const simulationButton = document.getElementById("simulationModeBtn");

    const modeStatus = document.getElementById("modeStatus");
    const headerSubtitle = document.getElementById("headerSubtitle");

    if (
        !liveDashboard ||
        !simulationDashboard ||
        !liveButton ||
        !simulationButton
    ) {
        console.error("Dashboard elements could not be found.");
        return;
    }

    if (mode === "SIMULATION") {
        modeStatus.textContent = "Loading simulation data...";

        try {
            await loadSimulationDashboard();

            const errorBox = document.getElementById("simulationError");

            // If loading failed, keep the existing mode active.
            if (errorBox.textContent) {
                modeStatus.textContent = "Current Mode: LIVE";
                return;
            }

            currentMode = "SIMULATION";

            liveDashboard.hidden = true;
            simulationDashboard.hidden = false;

            liveButton.classList.remove("active");
            simulationButton.classList.add("active");

            modeStatus.textContent =
                "Current Mode: SIMULATION | PostgreSQL Connected";

            headerSubtitle.textContent =
                "Simulated Network Management";

        } catch (error) {
            console.error("Simulation mode error:", error);

            modeStatus.textContent = "Current Mode: LIVE";

            alert(
                "Could not load simulation data. " +
                "Check your PostgreSQL connection and API."
            );
        }

        return;
    }

    // Restore the original live dashboard.
    currentMode = "LIVE";

    simulationDashboard.hidden = true;
    liveDashboard.hidden = false;

    simulationButton.classList.remove("active");
    liveButton.classList.add("active");

    modeStatus.textContent = "Current Mode: LIVE";

    headerSubtitle.textContent = "Live Network Discovery";
}


async function loadSimulationDashboard() {
    const errorBox = document.getElementById("simulationError");
    const databaseStatus = document.getElementById("simulationDatabaseStatus");
    errorBox.textContent = "";
    databaseStatus.textContent = "Connecting to PostgreSQL...";

    try {
        const [statusResponse, devicesResponse] = await Promise.all([
            fetch("/api/simulation/status"),
            fetch("/api/simulation/devices")
        ]);
        if (!statusResponse.ok || !devicesResponse.ok) {
            throw new Error("Could not retrieve simulation data from the backend.");
        }

        const statusData = await statusResponse.json();
        const deviceData = await devicesResponse.json();
        document.getElementById("simTotalDevices").textContent = statusData.total_devices ?? 0;
        document.getElementById("simOnlineDevices").textContent = statusData.online_devices ?? 0;
        document.getElementById("simOfflineDevices").textContent = statusData.offline_devices ?? 0;
        renderSimulationDevices(deviceData.devices || []);
        databaseStatus.textContent =
            `Database: ${statusData.database || "connected"} | Devices loaded: ${(deviceData.devices || []).length}`;

        // Optional dashboard panels load independently, so one endpoint error won't hide device inventory.
        const panels = [
            {url: "/api/simulation/metrics", key: "metrics", render: renderSimulationMetrics},
            {url: "/api/simulation/topology", key: "links", render: renderSimulationTopology},
            {url: "/api/simulation/scans", key: "scans", render: renderSimulationScans},
            {url: "/api/simulation/events", key: "events", render: renderSimulationEvents},
            {url: "/api/simulation/alerts", key: "alerts", render: renderSimulationAlerts},
            {url: "/api/simulation/services", key: "services", render: renderSimulationServices}
        ];
        const panelResults = await Promise.allSettled(panels.map(async panel => {
            const response = await fetch(panel.url);
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || `${panel.url} returned ${response.status}`);
            }
            const data = await response.json();
            panel.render(data[panel.key] || []);
            return panel.url;
        }));
        const failures = panelResults
            .map((result, index) => result.status === "rejected"
                ? `${panels[index].url}: ${result.reason.message}` : null)
            .filter(Boolean);
        if (failures.length) {
            errorBox.textContent = "Some panels could not load: " + failures.join(" | ");
        }
    } catch (error) {
        console.error("Failed to load simulation dashboard:", error);
        errorBox.textContent = error.message;
        databaseStatus.textContent = "Could not load data from PostgreSQL.";
        throw error;
    }
}

function displayDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function fillTableBody(id, rows, columns, emptyMessage) {
    const tbody = document.getElementById(id);
    if (!tbody) return;
    tbody.replaceChildren();
    if (!rows.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = columns.length;
        td.textContent = emptyMessage;
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }
    rows.forEach(rowData => {
        const tr = document.createElement("tr");
        columns.forEach(column => {
            const td = document.createElement("td");
            const value = typeof column.value === "function"
                ? column.value(rowData) : rowData[column.value];
            td.textContent = value === null || value === undefined || value === ""
                ? "—" : String(value);
            if (column.status) {
                const normalized = String(value || "").toUpperCase();
                if (["UP", "OPEN", "RUNNING", "COMPLETED", "INFO"].includes(normalized)) {
                    td.classList.add("device-status-up");
                } else if (["DOWN", "CRITICAL", "WARNING", "FAILED"].includes(normalized)) {
                    td.classList.add("device-status-down");
                }
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
}

function renderSimulationMetrics(rows) {
    fillTableBody("simulationMetricsBody", rows, [
        {value: "hostname"}, {value: "metric_name"},
        {value: r => `${r.metric_value ?? "—"} ${r.unit || ""}`},
        {value: r => displayDate(r.recorded_at)}
    ], "No monitoring metrics found.");
}

function renderSimulationScans(rows) {
    fillTableBody("simulationScansBody", rows, [
        {value: "network_name"}, {value: "scan_type"},
        {value: "status", status: true},
        {value: r => displayDate(r.started_at)},
        {value: r => displayDate(r.completed_at)}
    ], "No scan history found.");
}

function renderSimulationEvents(rows) {
    fillTableBody("simulationEventsBody", rows, [
        {value: "hostname"}, {value: "event_type"},
        {value: "severity", status: true}, {value: "message"},
        {value: r => displayDate(r.detected_at)},
        {value: r => r.resolved_at ? "Resolved" : "Active"}
    ], "No network events found.");
}

function renderSimulationAlerts(rows) {
    fillTableBody("simulationAlertsBody", rows, [
        {value: "hostname"}, {value: "alert_type"},
        {value: "severity", status: true}, {value: "status", status: true},
        {value: "message"}, {value: r => displayDate(r.created_at)}
    ], "No alerts found.");
}

function renderSimulationServices(rows) {
    fillTableBody("simulationServicesBody", rows, [
        {value: "hostname"}, {value: "service_name"}, {value: "protocol"},
        {value: "port"}, {value: "state", status: true},
        {value: r => displayDate(r.last_seen)}
    ], "No service associations found.");
}

function renderSimulationTopology(links) {
    const svg = document.getElementById("simulationTopologyGraph");
    const status = document.getElementById("simulationTopologyStatus");
    if (!svg || !status) return;
    svg.replaceChildren();

    const nodeMap = new Map();
    links.forEach(link => {
        nodeMap.set(link.source_device_id, {
            id: link.source_device_id, name: link.source_hostname,
            type: link.source_type, ip: link.source_ip
        });
        nodeMap.set(link.destination_device_id, {
            id: link.destination_device_id, name: link.destination_hostname,
            type: link.destination_type, ip: link.destination_ip
        });
    });
    if (!nodeMap.size) {
        status.textContent = "No topology links found. Check the topology_link table.";
        return;
    }

    const nodes = [...nodeMap.values()];
    const positions = new Map();
    const centerX = 450, centerY = 210, radius = Math.min(160, 40 + nodes.length * 13);
    nodes.forEach((node, index) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * index / nodes.length);
        positions.set(node.id, {x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle)});
    });

    const makeSvg = (tag, attrs, textContent) => {
        const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
        Object.entries(attrs || {}).forEach(([key, value]) => el.setAttribute(key, value));
        if (textContent !== undefined) el.textContent = textContent;
        return el;
    };

    links.forEach(link => {
        const a = positions.get(link.source_device_id), b = positions.get(link.destination_device_id);
        if (!a || !b) return;
        svg.appendChild(makeSvg("line", {
            x1: a.x, y1: a.y, x2: b.x, y2: b.y,
            class: "topology-link " + (String(link.link_status).toUpperCase() === "DOWN" ? "sim-link-down" : "")
        }));
    });

    nodes.forEach(node => {
        const p = positions.get(node.id);
        const group = makeSvg("g", {class: "topology-node simulation-topology-node", transform: `translate(${p.x},${p.y})`});
        group.appendChild(makeSvg("circle", {r: 24}));
        const label = String(node.type || "device").toUpperCase().slice(0, 4);
        group.appendChild(makeSvg("text", {"text-anchor": "middle", y: 4}, label));
        group.appendChild(makeSvg("text", {"text-anchor": "middle", y: 39, class: "topology-label"}, node.name || "Unknown"));
        group.appendChild(makeSvg("text", {"text-anchor": "middle", y: 53, class: "topology-ip"}, node.ip || ""));
        group.appendChild(makeSvg("title", {}, `${node.name || "Unknown"} (${node.ip || "No IP"})`));
        svg.appendChild(group);
    });
    status.textContent = `${nodes.length} devices connected by ${links.length} recorded topology links.`;
}


function renderSimulationDevices(devices) {
    const tbody = document.getElementById("simulationDeviceBody");

    tbody.replaceChildren();

    if (!devices.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 5;
        cell.textContent = "No simulated devices found in PostgreSQL.";

        row.appendChild(cell);
        tbody.appendChild(row);

        return;
    }

    for (const device of devices) {
        const row = document.createElement("tr");

        const values = [
            device.hostname,
            device.device_type,
            device.vendor || "Unknown",
            device.management_ip || "Unassigned",
            device.status
        ];

        values.forEach((value, index) => {
            const cell = document.createElement("td");

            cell.textContent = String(value ?? "Unknown");

            if (index === 4) {
                const deviceStatus = String(
                    device.status || ""
                ).toUpperCase();

                if (deviceStatus === "UP") {
                    cell.classList.add("device-status-up");
                } else if (deviceStatus === "DOWN") {
                    cell.classList.add("device-status-down");
                }
            }

            row.appendChild(cell);
        });

        tbody.appendChild(row);
    }
}