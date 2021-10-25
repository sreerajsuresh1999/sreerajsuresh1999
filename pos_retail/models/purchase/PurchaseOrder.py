from odoo import api, models, fields
import odoo
import logging

_logger = logging.getLogger(__name__)

class PurchaseOrder(models.Model):
    _inherit = "purchase.order"

    signature = fields.Binary('Signature', readonly=1)
    journal_id = fields.Many2one('account.journal', 'Vendor bill Journal')
    pos_branch_id = fields.Many2one('pos.branch', string='Branch', readonly=1)

    @api.model
    def create(self, vals):
        if not vals.get('pos_branch_id'):
            vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
        order = super(PurchaseOrder, self).create(vals)
        return order

    @api.model
    def create_po(self, vals, purchase_order_state):
        po = self.create(vals)
        for line in po.order_line:
            line._onchange_quantity()
        error = None
        try:
            po.button_confirm()
        except Exception as ex:
            _logger.error(ex)
            error = ex
        return {
            'name': po.name,
            'id': po.id,
            'error': error
        }

class PurchaseOrderLine(models.Model):
    _inherit = "purchase.order.line"

    pos_branch_id = fields.Many2one('pos.branch', string='Branch', readonly=1)

    @api.model
    def create(self, vals):
        if not vals.get('pos_branch_id'):
            vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
        order_line = super(PurchaseOrderLine, self).create(vals)
        return order_line