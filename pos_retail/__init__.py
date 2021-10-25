# -*- coding: utf-8 -*-
# License: Odoo Proprietary License v1.0
from . import controllers
from . import models
from . import reports
from . import wizards
from . import controller_printer_network
from . import controller_cache
from odoo import api, fields, models, _

from odoo import api, SUPERUSER_ID
import logging

_logger = logging.getLogger(__name__)

def _auto_clean_cache_when_installed(cr, registry):
    env = api.Environment(cr, SUPERUSER_ID, {})
    caches = env['pos.cache.database'].search([])
    caches.unlink()
    env['ir.config_parameter'].sudo().set_param('license_started_date', fields.Date.today())
    _logger.info('!!!!!!! Removed caches !!!!!!!')
    _logger.info('!!!!!!! THANKS FOR PURCHASED MODULE !!!!!!!')

