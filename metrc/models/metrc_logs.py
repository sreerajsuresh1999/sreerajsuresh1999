from odoo import models, fields


class MetrcLogs(models.Model):
    _name = 'metrc.log'
    _rec_name = 'res_name'

    res_name = fields.Char('Related Document Name')
    res_model = fields.Char('Related Document Model Name')
    operation = fields.Char('Operation')
    full_url = fields.Char('Full URL')
    data = fields.Char('Data')
    response = fields.Char('Response')
    account_id = fields.Many2one('metrc.account', string='Account')
