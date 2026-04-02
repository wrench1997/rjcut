#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
from fastapi import Header, HTTPException


def get_api_keys():
    raw = os.getenv("API_KEYS", "")
    return {x.strip() for x in raw.split(",") if x.strip()}


def verify_api_key(authorization: str = Header(None)):
    keys = get_api_keys()
    if not keys:
        raise HTTPException(status_code=500, detail="server api keys not configured")

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")

    token = authorization[7:].strip()
    if token not in keys:
        raise HTTPException(status_code=401, detail="invalid api key")

    return token