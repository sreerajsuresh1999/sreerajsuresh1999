# -*- coding: utf-8 -*-
from odoo import api, fields, models, tools, _
from odoo.exceptions import UserError
import hashlib


class res_users(models.Model):
    _inherit = "res.users"

    pos_config_id = fields.Many2one(
        'pos.config',
        'Point Of Sale Login Direct',
        help='If you set pos profile here \n'
             'When this user login to odoo, automatic login direct to POS'
    )
    pos_delete_order = fields.Boolean(
        'Delete POS Orders',
        default=0)
    pos_security_pin = fields.Integer(
        string='POS Security PIN',
        help='A Security PIN used to protect sensible functionality in the Point of Sale')
    pos_branch_id = fields.Many2one(
        'pos.branch',
        string='POS Branch Assigned',
        help='This is branch default for any records data create by this user'
    )
    allow_access_backend = fields.Boolean(
        'Allow Access Backend',
        default=1,
        help='If uncheck this checkbox \n'
             'User can not login to Backend Odoo \n'
             'Please make sure this user not admin \n'
             'Because admin need access to backend for change setting of system'
    )

    def get_barcodes_and_pin_hashed(self):
        users = self.search([('id', 'in', self.ids)])
        users_data = self.sudo().search_read([('id', 'in', users.ids)], ['barcode'])
        for u in users_data:
            u['barcode'] = hashlib.sha1(u['barcode'].encode('utf8')).hexdigest() if u['barcode'] else False
        return users_data
