from odoo import models, fields


class IrCron(models.Model):
    _inherit = 'ir.cron'

    is_metrc = fields.Boolean('METRC')
