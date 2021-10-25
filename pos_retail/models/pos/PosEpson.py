# -*- coding: utf-8 -*-
from odoo import api, models, fields, registry
import logging

_logger = logging.getLogger(__name__)


class pos_epson(models.Model):
    _name = "pos.epson"
    _description = "Epson Printer, print without posbox"

    name = fields.Char('Name', required=1)
    ip = fields.Char('Proxy Ip Adress', help='Example: 192.168.1.100, \n'
                                       'Only ip address, dont input port\n'
                                       'Only ip address, dont input domain\n'
                                       'Only ip address, dont input http and https\n'
                                       'We only supported print viva ip address.', required=1)
    _sql_constraints = [
        ('ip_uniq', 'unique(ip)', 'This ip address have exist before, ip address is unit of system.'),
    ]
