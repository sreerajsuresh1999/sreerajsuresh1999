# -*- coding: utf-8 -*-
from . import models

from odoo import api, SUPERUSER_ID

import logging
_logger = logging.getLogger(__name__)

def auto_action_after_install(cr, registry):
    env = api.Environment(cr, SUPERUSER_ID, {})
    _logger.info('{auto_action_after_install} ---------------- INSTALLED                           ---------')
    _logger.info('{auto_action_after_install} ---------------- THANKS FOR SUPPORT PURCHASED MODULE ---------')
    _logger.info('{auto_action_after_install} ---------------- thanhchatvn@gmail.com               ---------')