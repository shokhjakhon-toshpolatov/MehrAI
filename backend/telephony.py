"""Outbound handset test. Credentials and the destination stay on the server."""
import os
import re
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree as XML

import httpx


def settings():
    path = Path(__file__).with_name(".env.local")
    values = {}
    if path.is_file():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            name, separator, value = line.partition("=")
            if separator:
                values[name.strip()] = value.strip().strip("\"'")
    return {**values, **os.environ}


def missing(config):
    return [name for name in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
                              "TWILIO_FROM_NUMBER", "MEHRAI_TEST_PHONE") if not config.get(name)]


def calls_url(config):
    sid = config["TWILIO_ACCOUNT_SID"]
    if not re.fullmatch(r"AC[0-9a-fA-F]{32}", sid):
        raise ValueError("TWILIO_ACCOUNT_SID")
    for name in ("TWILIO_FROM_NUMBER", "MEHRAI_TEST_PHONE"):
        if not re.fullmatch(r"\+[1-9][0-9]{7,14}", config[name]):
            raise ValueError(name)
    return f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Calls"


def greeting(config):
    xml = XML.Element("Response")
    generation = config.get("VOICELAB_GREETING_ID")
    if generation:
        response = httpx.get(
            "https://api.voicelab.uz/v1/tts/generations/" + quote(generation, safe=""),
            headers={"Authorization": "Bearer " + config.get("VOICELAB_API_KEY", "")}, timeout=4)
        response.raise_for_status()
        job = response.json()
        if job.get("status") != "completed" or not str(job.get("audio_url", "")).startswith("https://"):
            raise ValueError("VOICELAB_GREETING_ID")
        XML.SubElement(xml, "Play").text = job["audio_url"]
    else:
        XML.SubElement(xml, "Say", language="ru-RU", voice="Polly.Tatyana").text = (
            "Здравствуйте. Это тестовый звонок от Мехр А И. Спасибо. До свидания.")
    return XML.tostring(xml, encoding="unicode")


def dial(config, instructions):
    response = httpx.post(calls_url(config) + ".json",
                          auth=(config["TWILIO_ACCOUNT_SID"], config["TWILIO_AUTH_TOKEN"]),
                          data={"To": config["MEHRAI_TEST_PHONE"], "From": config["TWILIO_FROM_NUMBER"],
                                "Twiml": instructions, "Timeout": "25"}, timeout=5)
    response.raise_for_status()
    sid = response.json()["sid"]
    if not re.fullmatch(r"CA[0-9a-fA-F]{32}", sid):
        raise ValueError("Invalid call SID")
    return sid


def lookup(config, sid):
    response = httpx.get(f"{calls_url(config)}/{sid}.json",
                         auth=(config["TWILIO_ACCOUNT_SID"], config["TWILIO_AUTH_TOKEN"]), timeout=5)
    response.raise_for_status()
    call = response.json()
    return call["status"], int(call["duration"]) if call.get("duration") else None
