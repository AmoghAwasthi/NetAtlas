import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .database import Base, engine, get_db
from .discovery import (get_local_subnet, get_local_network_info)
from .manager import perform_scan
from .models import Device, DeviceEvent
from .schemas import DeviceOut, ScanResult
from .ws import manager

FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"

async def discovery_loop():
    while True:
        try:
            subnet, devices = await asyncio.to_thread(perform_scan)
            network_info = await asyncio.to_thread(get_local_network_info)

            await manager.broadcast_json({
                "type": "network_update",
                "subnet": subnet,
                "local_ip": network_info["local_ip"],
                "gateway_ip": network_info["gateway_ip"],
                "devices": [
                    DeviceOut.model_validate(device).model_dump(mode="json")
                    for device in devices
                ],
            })
        except Exception as exc:
            await manager.broadcast_json({
                "type": "error",
                "message": str(exc)
            })

@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(bind=engine)
    task = asyncio.create_task(discovery_loop())
    yield
    task.cancel()

app = FastAPI(title="NetAtlas Live Network API", version="0.1.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")

@app.get("/api/network")
def network_info():
    try:
        return get_local_network_info()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc)
        )

@app.get("/api/devices", response_model=list[DeviceOut])
def devices(db: Session = Depends(get_db)):
    return db.scalars(select(Device).order_by(Device.ip_address)).all()

@app.get("/api/events")
def events(db: Session = Depends(get_db)):
    rows = db.scalars(
        select(DeviceEvent).order_by(DeviceEvent.timestamp.desc()).limit(100)
    ).all()
    return [
        {
            "id": row.id,
            "device_id": row.device_id,
            "event_type": row.event_type,
            "timestamp": row.timestamp,
        }
        for row in rows
    ]

@app.post("/api/scan", response_model=ScanResult)
async def scan_now():
    try:
        subnet, devices = await asyncio.to_thread(perform_scan)
        network_info = await asyncio.to_thread(get_local_network_info)
        payload = {
            "type": "network_update",
            "subnet": subnet,
            "devices": [
                DeviceOut.model_validate(d).model_dump(mode="json")
                for d in devices
            ],
            "local_ip": network_info["local_ip"],
            "gateway_ip": network_info["gateway_ip"],
        }
        await manager.broadcast_json(payload)
        return ScanResult(subnet=subnet, devices_found=len(devices), devices=devices)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
