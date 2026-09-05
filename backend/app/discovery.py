import ipaddress
import socket
from dataclasses import dataclass
from scapy.all import ARP, Ether, srp, conf

@dataclass
class DiscoveredDevice:
    ip_address: str
    mac_address: str | None
    hostname: str | None = None

def get_local_subnet() -> str:
    # Uses Scapy's route table to identify the source IP.
    _, source_ip, _ = conf.route.route("0.0.0.0")
    if not source_ip or source_ip == "0.0.0.0":
        raise RuntimeError("Could not determine the local IP address.")
    return str(ipaddress.ip_network(f"{source_ip}/24", strict=False))

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
