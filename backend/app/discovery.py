import ipaddress
import socket
from dataclasses import dataclass
from scapy.all import ARP, Ether, srp, conf

@dataclass
class DiscoveredDevice:
    ip_address: str
    mac_address: str | None
    hostname: str | None = None

def get_local_network_info() -> dict:
    _, source_ip, gateway_ip = conf.route.route("0.0.0.0")

    if not source_ip or source_ip == "0.0.0.0":
        raise RuntimeError(
            "Could not determine the local IP address."
        )

    subnet = str(
        ipaddress.ip_network(
            f"{source_ip}/24",
            strict=False
        )
    )

    return {
        "local_ip": source_ip,
        "gateway_ip": (
            gateway_ip
            if gateway_ip and gateway_ip != "0.0.0.0"
            else None
        ),
        "subnet": subnet,
    }


def get_local_subnet() -> str:
    return get_local_network_info()["subnet"]

def resolve_hostname(ip: str) -> str | None:
    try:
        hostname, _, _ = socket.gethostbyaddr(ip)
        return hostname
    except (socket.herror, socket.gaierror, OSError):
        return None

def arp_scan(subnet: str) -> list[DiscoveredDevice]:
    packet = Ether(dst="ff:ff:ff:ff:ff:ff") / ARP(pdst=subnet)
    answered, _ = srp(packet, timeout=2, verbose=False)

    return [
        DiscoveredDevice(
            ip_address=response.psrc,
            mac_address=response.hwsrc,
            hostname=resolve_hostname(response.psrc),
        )
        for _, response in answered
    ]
