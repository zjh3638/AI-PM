"""LDAP configuration helper — reads from settings.json, falls back to env/Config."""

import json
from pathlib import Path
from typing import Optional

from app.config import settings

SETTINGS_FILE = Path(__file__).parent.parent.parent / "settings.json"

# LDAP config keys that can be set via settings.json
LDAP_KEYS = {
    "ldap_enabled": "ldap_enabled",
    "ldap_server_uri": "ldap_server_uri",
    "ldap_bind_dn": "ldap_bind_dn",
    "ldap_bind_password": "ldap_bind_password",
    "ldap_base_dn": "ldap_base_dn",
    "ldap_user_filter": "ldap_user_filter",
    "ldap_username_attribute": "ldap_username_attribute",
    "ldap_display_name_attribute": "ldap_display_name_attribute",
    "ldap_email_attribute": "ldap_email_attribute",
    "ldap_auto_create_user": "ldap_auto_create_user",
}


def _load_file() -> dict:
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def get_ldap_config() -> dict:
    """Read LDAP configuration from settings.json, falling back to config defaults.

    Returns a dict with all LDAP keys.  settings.json values take precedence
    over environment / Config defaults.
    """
    file_data = _load_file()
    env_defaults = {
        "ldap_enabled": settings.ldap_enabled,
        "ldap_server_uri": settings.ldap_server_uri,
        "ldap_bind_dn": settings.ldap_bind_dn,
        "ldap_bind_password": settings.ldap_bind_password,
        "ldap_base_dn": settings.ldap_base_dn,
        "ldap_user_filter": settings.ldap_user_filter,
        "ldap_username_attribute": settings.ldap_username_attribute,
        "ldap_display_name_attribute": settings.ldap_display_name_attribute,
        "ldap_email_attribute": settings.ldap_email_attribute,
        "ldap_auto_create_user": settings.ldap_auto_create_user,
    }
    merged = {}
    for key, env_default in env_defaults.items():
        merged[key] = file_data.get(key, env_default)
    return merged


def get_ldap_config_for_display() -> dict:
    """Like get_ldap_config() but masks the password for API responses."""
    config = get_ldap_config()
    if config.get("ldap_bind_password"):
        config["ldap_bind_password"] = "****"
    return config
