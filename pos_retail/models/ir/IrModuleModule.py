# -*- coding: utf-8 -*-
from odoo import api, models, fields

class IrModuleModule(models.Model):
    _inherit = "ir.module.module"

    # # TODO: when users admin do upgrade module, auto remove all call logs databases of POS
    # def button_immediate_upgrade(self):
    #     for module in self:
    #         if module.name == 'pos_retail':
    #             self.env.cr.execute("delete from ir_model_relation where name='account_tax_sale_order_line_insert_rel'")
    #             self.env['pos.backup.orders'].search([]).unlink
    #             self.env['pos.call.log'].search([]).unlink
    #             self.env['ir.config_parameter'].search([('key', 'in', ['res.partner', 'product.product'])]).unlink()
    #             self.env['pos.session'].search([('state', '=', 'opened')]).write({
    #                 'required_reinstall_cache': True
    #             })
    #     return super(IrModuleModule, self).button_immediate_upgrade()
