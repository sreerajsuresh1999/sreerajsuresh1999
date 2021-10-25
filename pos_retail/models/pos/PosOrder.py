# -*- coding: utf-8 -*-
from odoo import api, fields, models, tools, _, registry
from odoo.tools import DEFAULT_SERVER_DATETIME_FORMAT
from odoo.exceptions import UserError
import base64

import logging
from datetime import datetime, timedelta

MAP_INVOICE_TYPE_PARTNER_TYPE = {
    'out_invoice': 'customer',
    'out_refund': 'customer',
    'out_receipt': 'customer',
    'in_invoice': 'supplier',
    'in_refund': 'supplier',
    'in_receipt': 'supplier',
}

_logger = logging.getLogger(__name__)


class POSOrder(models.Model):
    _inherit = 'pos.order'

    take_away_order = fields.Boolean('Take Away Order')
    delivery_date = fields.Datetime('Delivery Date of Bill')
    delivered_date = fields.Datetime('Delivered Date of Bill')
    delivery_address = fields.Char('Delivery Address of Bill')
    delivery_phone = fields.Char('Delivery Phone', help='Phone of Customer for Shipping')
    shipping_id = fields.Many2one('res.partner', 'Partner Shipping')
    statement_ids = fields.One2many(
        'account.bank.statement.line',
        'pos_statement_id',
        string='Bank Payments',
        states={'draft': [('readonly', False)]},
        readonly=True)
    promotion_ids = fields.Many2many(
        'pos.promotion',
        'pos_order_promotion_rel',
        'order_id',
        'promotion_id',
        string='Promotions')
    ean13 = fields.Char('Ean13', readonly=1)
    expire_date = fields.Datetime('Expire Date')
    is_return = fields.Boolean('Is Return')
    is_returned = fields.Boolean('Is Returned')
    add_credit = fields.Boolean('Add Credit')
    return_order_id = fields.Many2one('pos.order', 'Return from Order')
    email = fields.Char('Email')
    email_invoice = fields.Boolean('Email Invoice')
    plus_point = fields.Float('Plus Point', readonly=1)
    redeem_point = fields.Float('Redeem Points', readonly=1)
    signature = fields.Binary('Signature', readonly=1)
    parent_id = fields.Many2one('pos.order', 'Parent Order', readonly=1)
    sale_id = fields.Many2one('sale.order', 'Sale Order', readonly=1)
    partial_payment = fields.Boolean('Partial Payment')
    margin = fields.Float(
        'Margin',
        compute='_compute_margin',
        store=True
    )
    booking_id = fields.Many2one(
        'sale.order',
        'Covert from Sale Order',
        help='This order covert from Quotation Sale order',
        readonly=1)
    payment_journal_id = fields.Many2one(
        'account.journal',
        string='Payment Journal',
        readonly=0,
        related=None, )
    location_id = fields.Many2one(
        'stock.location',
        string="Source Location",
        related=None,
        readonly=1)
    pos_branch_id = fields.Many2one('pos.branch', string='Branch', readonly=1)
    is_paid_full = fields.Boolean('Is Paid Full', compute='_checking_payment_full')
    currency_id = fields.Many2one('res.currency', string='Currency', readonly=1, related=False)
    analytic_account_id = fields.Many2one(
        'account.analytic.account',
        'Analytic Account'
    )
    state = fields.Selection(selection_add=[
        ('quotation', 'Quotation')
    ], ondelete={
        'quotation': 'set default',
    })
    removed_user_id = fields.Many2one(
        'res.users',
        'Removed by User',
        readonly=1)
    is_quotation = fields.Boolean('Is Quotation Order')
    paid_date = fields.Datetime('Paid Date')
    picking_type_id = fields.Many2one(
        'stock.picking.type', related=False,
        string="Operation Type",
        readonly=False)
    receipt_count = fields.Integer(compute='_get_receipt_count', string='Receipt Count')
    point_ids = fields.One2many('pos.loyalty.point', 'order_id', 'Points')

    def _get_receipt_count(self):
        attachments = self.env['ir.attachment'].search([
            ('res_model', '=', 'pos.order'),
            ('res_id', '=', self.id)
        ])
        self.receipt_count = len(attachments)

    def action_download_receipt(self):
        self.ensure_one()
        action = self.env['ir.actions.act_window']._for_xml_id('base.action_attachment')
        action['context'] = {}
        action['domain'] = [('res_model', '=', 'pos.order'), ('res_id', '=', self.id)]
        return action

    @api.model
    def search_read(self, domain=None, fields=None, offset=0, limit=None, order=None):
        context = self._context.copy()
        if context.get('pos_config_id', None):
            config = self.env['pos.config'].browse(context.get('pos_config_id'))
            domain = [('config_id', '=', config.id)]
            if config.pos_orders_load_orders_another_pos:
                domain = []
            today = datetime.today()
            if config.load_orders_type == 'load_all':
                domain = domain
            if config.load_orders_type == 'last_3_days':
                loadFromDate = today + timedelta(days=-3)
                domain.append(('create_date', '>=', loadFromDate))
            if config.load_orders_type == 'last_7_days':
                loadFromDate = today + timedelta(days=-7)
                domain.append(('create_date', '>=', loadFromDate))
            if config.load_orders_type == 'last_1_month':
                loadFromDate = today + timedelta(days=-30)
                domain.append(('create_date', '>=', loadFromDate))
            if config.load_orders_type == 'last_1_year':
                loadFromDate = today + timedelta(days=-365)
                domain.append(('create_date', '>=', loadFromDate))
            if context.get('partner_id', None):
                domain = [('partner_id', '=', context.get('partner_id', None))]
            if context.get('reference', None):
                domain = ['|', '|', ('name', '=', context.get('reference', None)),
                          ('pos_reference', '=', context.get('reference', None)),
                          ('ean13', '=', context.get('reference', None))]
            _logger.info(domain)
        return super().search_read(domain=domain, fields=fields, offset=offset, limit=limit, order=order)

    def getTopSellingProduct(self, totalRows):
        sql = """
            select 
                pol.product_id, sum(pol.qty)
            from 
                pos_order_line as pol
            group by pol.product_id
            Order by sum(pol.qty) desc
            limit %s
        """ % totalRows
        self.env.cr.execute(sql)
        topSellingProducts = self.env.cr.fetchall()
        return topSellingProducts

    def print_report(self):
        for order in self:
            return order.print_html_report(order.id, 'pos_retail.pos_order_template')

    def print_html_report(self, docids, reportname, data=None):
        report = self.env['ir.actions.report'].sudo()._get_report_from_name(reportname)
        html = report.render_qweb_html(docids, data=data)[0]
        return html

    def _prepare_invoice_vals(self):
        vals = super(POSOrder, self)._prepare_invoice_vals()
        vals['journal_id'] = self.payment_journal_id.id
        return vals

    def action_pos_order_invoice(self):
        """
        TODO: add move_id return back to pos screen
        """
        result = super(POSOrder, self).action_pos_order_invoice()
        move_id = result.get('res_id', None)
        if move_id:
            result.update({'move_id': move_id})
        return result

    def made_invoice(self):
        for order in self:
            order.action_pos_order_invoice()
            order.account_move.sudo().with_context(force_company=self.env.user.company_id.id).post()
        return True

    # todo: when cancel order we set all quantity of lines and payment method amount to 0
    # todo: because when pos session closing, odoo core get all total amount of line and pos payment compare before posting
    def action_pos_order_cancel(self):
        for order in self:
            if order.picking_ids or order.account_move:
                raise UserError(_(
                    'Error, Order have Delivery Order or Account move, it not possible cancel, please return products'))
            order.lines.write({
                'price_unit': 0,
                'price_subtotal': 0,
                'price_subtotal_incl': 0,
            })
            order.write({'amount_total': 0})
            order.payment_ids.write({'amount': 0})
        return super(POSOrder, self).action_pos_order_cancel()

    def _is_pos_order_paid(self):
        if not self.currency_id and self.env.user.company_id.currency_id:
            self.currency_id = self.env.user.company_id.currency_id.id
        return super(POSOrder, self)._is_pos_order_paid()

    def _checking_payment_full(self):
        for order in self:
            order.is_paid_full = False
            if (order.amount_paid - order.amount_return) == order.amount_total:
                order.is_paid_full = True

    @api.depends('lines.margin')
    def _compute_margin(self):
        for order in self:
            order.margin = sum(order.mapped('lines.margin'))

    def unlink(self):
        for order in self:
            if order._is_pos_order_paid():
                raise UserError(_(
                    'Not allow remove Order have payment information. Please set to Cancel, Order Ref %s' % order.name))
            if order.state == 'cancel' and order.removed_user_id and not self.env.user.has_group(
                    'point_of_sale.group_pos_manager'):
                raise UserError(_(
                    "You can not remove this order, only POS Manager can do it"))
        return super(POSOrder, self).unlink()

    def write(self, vals):
        """
        TODO: required link pos_branch_id to:
            - account bank statement and lines
            - account move and lines (x)
            - stock picking and moves, and stock moves line (x)
            - pos payment (x)
        """
        if vals.get('state', None) in ['paid', 'invoice']:
            vals.update({'paid_date': fields.Datetime.today()})
        res = super(POSOrder, self).write(vals)
        for order in self:
            pos_branch = order.pos_branch_id
            if order.picking_ids:
                picking_ids = [p.id for p in order.picking_ids]
                picking_ids.append(0)
                if not order.location_id:
                    if not pos_branch:
                        self.env.cr.execute(
                            "UPDATE stock_picking SET pos_order_id=%s where id in %s", (order.id, tuple(picking_ids),))
                    else:
                        self.env.cr.execute(
                            "UPDATE stock_picking SET pos_branch_id=%s, pos_order_id=%s where id in %s", (
                                pos_branch.id, order.id, tuple(picking_ids),))
                else:
                    if not pos_branch:
                        self.env.cr.execute(
                            "UPDATE stock_picking SET pos_order_id=%s,location_id=%s  where id in %s", (
                                order.id, order.location_id.id, tuple(picking_ids),))
                    else:
                        self.env.cr.execute(
                            "UPDATE stock_picking SET pos_branch_id=%s, pos_order_id=%s,location_id=%s  where id in %s",
                            (
                                pos_branch.id, order.id, order.location_id.id, tuple(picking_ids),))
                if pos_branch:
                    self.env.cr.execute(
                        "UPDATE stock_move SET pos_branch_id=%s WHERE picking_id in %s",
                        (pos_branch.id, tuple(picking_ids),))
                    self.env.cr.execute(
                        "UPDATE stock_move_line SET pos_branch_id=%s WHERE picking_id in %s" % (
                            pos_branch.id, tuple(picking_ids),))
            if vals.get('state', False) in ['paid', 'invoiced']:
                for line in order.lines:
                    self.env.cr.execute(
                        "UPDATE pos_voucher SET state='active' WHERE pos_order_line_id=%s" % (
                            line.id))  # TODO: active vouchers for customers can use, required paid done
                order.pos_compute_loyalty_point()
                order.auto_closing_backup_session()
            if order.pos_branch_id:
                if order.account_move:
                    self.env.cr.execute("UPDATE account_move SET pos_branch_id=%s WHERE id=%s" % (
                        order.pos_branch_id.id, order.account_move.id))
                    self.env.cr.execute("UPDATE account_move_line SET pos_branch_id=%s WHERE move_id=%s" % (
                        order.pos_branch_id.id, order.account_move.id))
        return res

    def action_pos_order_paid(self):
        self.ensure_one()
        if self.config_id.rounding and (
                (self.amount_total - self.amount_paid) > 0 and (self.amount_total - self.amount_paid) < 1):
            rounding_payment_method_id = None
            for payment in self.payment_ids:
                if payment.amount > 0:
                    rounding_payment_method_id = payment.payment_method_id.id
                    break
            if rounding_payment_method_id:
                payment_difference = self.amount_total - self.amount_paid
                _logger.info('Rounding cash %s' % payment_difference)
                rounding_payment_vals = {
                    'name': _('rounding cash'),
                    'pos_order_id': self.id,
                    'amount': payment_difference,
                    'payment_date': fields.Datetime.now(),
                    'payment_method_id': rounding_payment_method_id,
                    'is_change': True,
                }
                self.add_payment(rounding_payment_vals)
        return super(POSOrder, self).action_pos_order_paid()

    @api.model
    def auto_closing_backup_session(self):
        if self.session_id and self.session_id.backup_session:
            orders_not_paid = self.search([
                ('state', 'not in', ['paid', 'invoiced']),
                ('id', '!=', self.id),
                ('session_id', '=', self.session_id.id)
            ])
            if not orders_not_paid:
                self.session_id.force_action_pos_session_close()
        return True

    @api.model
    def create(self, vals):
        Session = self.env['pos.session'].sudo()
        session = Session.browse(vals.get('session_id'))
        if not vals.get('location_id', None):
            vals.update({
                'location_id': session.config_id.stock_location_id.id if session.config_id.stock_location_id else None
            })
        if not vals.get('payment_journal_id', None):
            vals.update({'payment_journal_id': session.config_id.journal_id.id})
        if session.config_id.pos_branch_id:
            vals.update({'pos_branch_id': session.config_id.pos_branch_id.id})
        if not vals.get('currency_id', None) and session.config_id.currency_id:
            vals.update({'currency_id': session.config_id.currency_id.id})
        bundle_pack_combo_items = {}
        dynamic_combo_items = {}
        addonItems = None
        if vals and vals.get('lines', []):
            for line in vals.get('lines', []):
                line = line[2]
                # TODO: combo bundle pack items
                combo_item_ids = line.get('combo_item_ids', None)
                if combo_item_ids:
                    for combo_item in combo_item_ids:
                        if float(combo_item['quantity']) <= 0:
                            continue
                        comboRecord = self.env['pos.combo.item'].sudo().browse(combo_item['id'])
                        productOfCombo = comboRecord.product_id
                        if not bundle_pack_combo_items.get(combo_item['id']):
                            bundle_pack_combo_items[combo_item['id']] = {
                                'product_id': productOfCombo.id,
                                'qty': float(combo_item['quantity']) * line['qty'],
                                'name': '%s [Combo Item of] %s' % (
                                    productOfCombo.name, line.get('full_product_name', ''))
                            }
                        else:
                            bundle_pack_combo_items[combo_item['id']]['qty'] += combo_item['quantity'] * line['qty']
                    del line['combo_item_ids']
                # TODO: combo dynamic items
                selected_combo_items = line.get('selected_combo_items', None)
                if selected_combo_items:
                    for product_id, quantity in selected_combo_items.items():
                        if not dynamic_combo_items.get(product_id, False):
                            dynamic_combo_items[int(product_id)] = quantity
                        else:
                            dynamic_combo_items[int(product_id)] += quantity
                    del line['selected_combo_items']
                if line.get('addon_ids', []):
                    if not addonItems:
                        addonItems = {}
                    for product_id in line.get('addon_ids'):
                        product = self.env['product.product'].browse(product_id)
                        addonItems[product_id] = {
                            'qty': line['qty'],
                            'name': '%s [Addon Item of] %s' % (product.name, line.get('full_product_name', ''))
                        }
                    del line['addon_ids']
        if not vals.get('pos_branch_id'):
            vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
        order = super(POSOrder, self).create(vals)
        if bundle_pack_combo_items:
            for combo_item_id, item in bundle_pack_combo_items.items():
                self.env['pos.order.line'].create({
                    'name': item['name'],
                    'full_product_name': item['name'],
                    'product_id': item['product_id'],
                    'qty': item['qty'],
                    'price_unit': 0,
                    'order_id': order.id,
                    'price_subtotal': 0,
                    'price_subtotal_incl': 0,
                })
        if addonItems:
            for product_id, item in addonItems.items():
                self.env['pos.order.line'].create({
                    'name': item['name'],
                    'full_product_name': item['name'],
                    'product_id': product_id,
                    'qty': item['qty'],
                    'price_unit': 0,
                    'order_id': order.id,
                    'price_subtotal': 0,
                    'price_subtotal_incl': 0,
                })
        if dynamic_combo_items:
            order.create_picking_dynamic_combo_items(dynamic_combo_items)
        if order.plus_point or order.redeem_point:
            order.pos_compute_loyalty_point()
        if order.return_order_id:
            order.return_order_id.write({'is_returned': True})
        order.create_picking_generic_options()
        return order

    def action_pos_order_send(self):
        if not self.partner_id:
            raise UserError(_('Customer not found on this Point of Sale Orders.'))
        self.ensure_one()
        template = self.env.ref('pos_retail.email_template_edi_pos_orders', False)
        compose_form = self.env.ref('mail.email_compose_message_wizard_form', False)
        ctx = dict(
            default_model='pos.order',
            default_res_id=self.id,
            default_use_template=bool(template),
            default_template_id=template and template.id or False,
            default_composition_mode='comment',
        )
        return {
            'name': _('Compose Email'),
            'type': 'ir.actions.act_window',
            'view_type': 'form',
            'view_mode': 'form',
            'res_model': 'mail.compose.message',
            'views': [(compose_form.id, 'form')],
            'view_id': compose_form.id,
            'target': 'new',
            'context': ctx,
        }

    def add_payment(self, data):
        if self.pos_branch_id:
            data.update({'pos_branch_id': self.pos_branch_id.id})
        if data.get('name', None) == 'return':
            order = self.browse(data.get('pos_order_id'))
            if order.currency_id and self.env.user.company_id.currency_id and order.currency_id.id != self.env.user.company_id.currency_id.id:
                customer_payment = self.env['pos.payment'].search([('pos_order_id', '=', order.id)], limit=1)
                if customer_payment:
                    data.update({
                        'payment_method_id': customer_payment.payment_method_id.id
                    })
        res = super(POSOrder, self).add_payment(data)
        return res

    def made_purchase_order(self):
        # TODO: create 1 purchase get products return from customer
        customer_return = self.env['res.partner'].search([('name', '=', 'Customer return')])
        po = self.env['purchase.order'].create({
            'partner_id': self.partner_id.id if self.partner_id else customer_return[0].id,
            'name': 'Return/' + self.name,
        })
        for line in self.lines:
            if line.qty < 0:
                self.env['purchase.order.line'].create({
                    'order_id': po.id,
                    'name': 'Return/' + line.product_id.name,
                    'product_id': line.product_id.id,
                    'product_qty': - line.qty,
                    'product_uom': line.product_id.uom_po_id.id,
                    'price_unit': line.price_unit,
                    'date_planned': datetime.today().strftime(DEFAULT_SERVER_DATETIME_FORMAT),
                })
        po.button_confirm()
        for picking in po.picking_ids:
            picking.action_assign()
            picking.force_assign()
            wrong_lots = self.set_pack_operation_lot(picking)
            if not wrong_lots:
                picking.button_validate()
        return True

    def set_done(self):
        return self.write({'state': 'done'})

    @api.model
    def action_send_email_with_receipt_to_customer(self, name, client, ticket, email, body):
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            return False
        orders = self.sudo().search([('pos_reference', '=', name)])
        if not orders:
            return False
        order = orders[0]
        client_name = client.get('name', None) if client else 'Guy'
        message = _("<p>Dear %s,<br/>Here is your electronic ticket for the %s. </p>") % (client_name, name)
        message += _('<p>Note Order : <strong>%s</strong>. </p>' % body)
        message += _('<p>Regards</p>')
        message += _('<p>%s</p>' % self.env.company.name)
        filename = 'Receipt-' + name + '.jpg'
        receipt = self.env['ir.attachment'].create({
            'name': filename,
            'type': 'binary',
            'datas': ticket,
            'res_model': 'pos.order',
            'res_id': order.id,
            'store_fname': filename,
            'mimetype': 'image/jpeg',
        })
        template_data = {
            'subject': _('Receipt %s') % name,
            'body_html': message,
            'author_id': self.env.user.partner_id.id,
            'email_from': self.env.company.email or self.env.user.email_formatted,
            'email_to': email,
            'attachment_ids': [(4, receipt.id)],
        }

        if orders.mapped('account_move'):
            report = self.env.ref('point_of_sale.pos_invoice_report').render_qweb_pdf(orders.ids[0])
            filename = name + '.pdf'
            attachment = self.env['ir.attachment'].create({
                'name': filename,
                'type': 'binary',
                'datas': base64.b64encode(report[0]),
                'store_fname': filename,
                'res_model': 'pos.order',
                'res_id': orders[:1].id,
                'mimetype': 'application/x-pdf'
            })
            template_data['attachment_ids'] += [(4, attachment.id)]

        mail = self.env['mail.mail'].create(template_data)
        mail.send()
        _logger.info('{POS} %s sending email success' % order.name)
        return True

    def saveReceipt(self, order_id=None, imageBase64=None):
        order = self.browse(order_id)
        if not order:
            return True
        fileName = order.pos_reference + '.jpg'
        receipt = self.env['ir.attachment'].create({
            'name': fileName,
            'type': 'binary',
            'datas': imageBase64,
            'res_model': 'pos.order',
            'res_id': order_id,
            'store_fname': fileName,
            'mimetype': 'image/jpeg',
        })
        _logger.info('new receipt saved: %s' % receipt.id)
        return receipt

    @api.model
    def action_send_email(self, subject, ticket, email, body):
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            return False
        message = _("<p>Dear,<br/>Have new message for you.</p>")
        message += _('<p>Description : <strong>%s</strong>. </p>' % body)
        message += _('<p>Regards</p>')
        message += _('<p>%s</p>' % self.env.company.name)
        filename = subject + '.jpg'
        receipt = self.env['ir.attachment'].create({
            'name': filename,
            'type': 'binary',
            'datas': ticket,
            'res_model': 'res.users',
            'res_id': self.env.user.id,
            'store_fname': filename,
            'mimetype': 'image/jpeg',
        })
        template_data = {
            'subject': _('%s') % subject,
            'body_html': message,
            'author_id': self.env.user.partner_id.id,
            'email_from': self.env.company.email or self.env.user.email_formatted,
            'email_to': email,
            'attachment_ids': [(4, receipt.id)],
        }
        mail = self.env['mail.mail'].create(template_data)
        mail.send()
        return True

    @api.model
    def _order_fields(self, ui_order):
        order_fields = super(POSOrder, self)._order_fields(ui_order)
        if ui_order.get('picking_type_id', None):
            order_fields.update({
                'picking_type_id': ui_order['picking_type_id']
            })
        else:
            order_fields.update({
                'picking_type_id': self.env['pos.session'].browse(
                    ui_order.get('pos_session_id')).config_id.picking_type_id.id
            })
        if ui_order.get('add_credit', False):
            order_fields.update({
                'add_credit': ui_order['add_credit']
            })
        if ui_order.get('partial_payment', False):
            order_fields.update({
                'partial_payment': ui_order['partial_payment']
            })
        if ui_order.get('sale_id', False):
            order_fields.update({
                'sale_id': ui_order['sale_id']
            })
        if ui_order.get('delivery_date', False):
            order_fields.update({
                'delivery_date': ui_order['delivery_date']
            })
        if ui_order.get('delivery_address', False):
            order_fields.update({
                'delivery_address': ui_order['delivery_address']
            })
        if ui_order.get('delivery_phone', False):
            order_fields.update({
                'delivery_phone': ui_order['delivery_phone']
            })
        if ui_order.get('shipping_id'):
            order_fields.update({
                'shipping_id': ui_order['shipping_id']
            })
        if ui_order.get('parent_id', False):
            order_fields.update({
                'parent_id': ui_order['parent_id']
            })
        if ui_order.get('payment_journal_id', False):
            order_fields['payment_journal_id'] = ui_order.get('payment_journal_id')
        if ui_order.get('ean13', False):
            order_fields.update({
                'ean13': ui_order['ean13']
            })
        if ui_order.get('expire_date', False):
            order_fields.update({
                'expire_date': ui_order['expire_date']
            })
        if ui_order.get('is_return', False):
            order_fields.update({
                'is_return': ui_order['is_return']
            })
        if ui_order.get('email', False):
            order_fields.update({
                'email': ui_order.get('email')
            })
        if ui_order.get('email_invoice', False):
            order_fields.update({
                'email_invoice': ui_order.get('email_invoice')
            })
        if ui_order.get('plus_point', 0):
            order_fields.update({
                'plus_point': ui_order['plus_point']
            })
        if ui_order.get('redeem_point', 0):
            order_fields.update({
                'redeem_point': ui_order['redeem_point']
            })
        if ui_order.get('note', None):
            order_fields.update({
                'note': ui_order['note']
            })
        if ui_order.get('return_order_id', False):
            order_fields.update({
                'return_order_id': ui_order['return_order_id']
            })
        if ui_order.get('location_id', False):
            order_fields.update({
                'location_id': ui_order['location_id']
            })
        if ui_order.get('booking_id', False):
            order_fields.update({
                'booking_id': ui_order['booking_id']
            })
        if ui_order.get('currency_id', False):
            order_fields.update({
                'currency_id': ui_order['currency_id']
            })
        if ui_order.get('analytic_account_id', False):
            order_fields.update({
                'analytic_account_id': ui_order['analytic_account_id']
            })
        if ui_order.get('combo_item_ids', False):
            order_fields.update({
                'combo_item_ids': ui_order['combo_item_ids']
            })
        if ui_order.get('take_away_order', False):
            order_fields.update({
                'take_away_order': ui_order['take_away_order']
            })
        if ui_order.get('state', False):
            order_fields.update({
                'state': ui_order['state']
            })
        if ui_order.get('removed_user_id', False):
            order_fields.update({
                'removed_user_id': ui_order['removed_user_id']
            })
        if (ui_order.get('state', False) == 'cancel' and ui_order.get('removed_user_id', False)):
            order_fields.update({
                'name': self.env['pos.session'].browse(ui_order['pos_session_id']).config_id.sequence_id._next(),
            })
        if ui_order.get('save_draft', None) and not ui_order.get('backend_id', None):
            order_fields.update({
                'name': self.env['pos.session'].browse(ui_order['pos_session_id']).config_id.sequence_id._next(),
            })
        return order_fields

    @api.model
    def _process_order(self, order, draft, existing_order):
        if order.get('data').get('state', None) == 'cancel':
            draft = True
        return super(POSOrder, self)._process_order(order, draft, existing_order)

    @api.model
    def get_code(self, code):
        return self.env['barcode.nomenclature'].sudo().sanitize_ean(code)

    def get_debit(self, order_id):
        order = self.browse(order_id)
        return order.amount_total - order.amount_paid

    def _process_payment_lines(self, pos_order, order, pos_session, draft):
        """
            - Reason we force this method of odoo bellow:
            1) If pos session use another pricelist have currency difference with pos config company currency
            2) have one statement rounding example: 0.11 VND inside statement_ids
            3) when order push to backend and currency VND have prec_acc = order.pricelist_id.currency_id.decimal_places is 1.0 (*)
            4) and method float_is_zero check 0.11 is 0 and if not float_is_zero(payments[2]['amount'], precision_digits=prec_acc) with be true
            5) if (4) true, _process_payment_lines not add statement rounding amount 0.11
            6) and when pos session action closing session and post entries, post entries will compare debit and credit and missed 0.11 VND
            7) And session could not close
            - So solution now is:
            1) if have order (pricelist >> currency) difference with company currency
            2) we not call parent method of odoo original
            3) we only check statement line have amount not zero and allow create rounding statement
            ---- END ----
        """
        company_currency = pos_session.config_id.company_id.currency_id
        company_currency_id = None
        if company_currency:
            company_currency_id = company_currency.id
        pricelist_currency_id = order.pricelist_id.currency_id.id
        pricelist_currency_difference_company_currency = False
        if company_currency_id and company_currency_id != pricelist_currency_id:
            pricelist_currency_difference_company_currency = True
        if not pricelist_currency_difference_company_currency:
            return super(POSOrder, self)._process_payment_lines(pos_order, order, pos_session, draft)
        else:
            order_bank_statement_lines = self.env['pos.payment'].search([('pos_order_id', '=', order.id)])
            order_bank_statement_lines.unlink()
            for payments in pos_order['statement_ids']:
                if payments[2]['amount'] != 0:
                    order.add_payment(self._payment_fields(order, payments[2]))
            order.amount_paid = sum(order.payment_ids.mapped('amount'))
            if (not draft and pos_order['amount_return'] != 0):
                cash_payment_method = pos_session.payment_method_ids.filtered('is_cash_count')[:1]
                if not cash_payment_method:
                    raise UserError(_("No cash statement found for this session. Unable to record returned cash."))
                return_payment_vals = {
                    'name': _('return'),
                    'pos_order_id': order.id,
                    'amount': -pos_order['amount_return'],
                    'payment_date': fields.Date.context_today(self),
                    'payment_method_id': cash_payment_method.id,
                }
                order.add_payment(return_payment_vals)

    def remove_fields_not_existing_order_line(self, orders):
        for o in orders:
            data = o['data']
            if not data.get('partner_id'):
                o['to_invoice'] = False
                o['data']['to_invoice'] = False
            lines = data.get('lines')
            for line_val in lines:
                line = line_val[2]
                new_line = {}
                for key, value in line.items():
                    if key not in [
                        'creation_time',
                        'mp_dirty',
                        'mp_skip',
                        'quantity_wait',
                        'state',
                        'tags',
                        'quantity_done',
                        'promotion_discount_total_order',
                        'promotion_discount_category',
                        'promotion_discount_by_quantity',
                        'promotion_discount',
                        'promotion_gift',
                        'promotion_price_by_quantity',
                    ]:
                        new_line[key] = value
                try:
                    line_val[2] = new_line
                except:
                    _logger.error('remove existing fields for order line fail')
        return orders

    @api.model
    def create_from_ui(self, orders, draft=False):
        ordersNew = self.remove_fields_not_existing_order_line(orders)
        ordersSaved = super(POSOrder, self).create_from_ui(ordersNew, draft=draft)
        ordersSavedData = self.rebuid_orders_response_back_to_pos(ordersSaved)
        _logger.info('%s [create_from_ui] %s' % (self.env.user.login, ordersSavedData))
        return ordersSavedData

    def rebuid_orders_response_back_to_pos(self, orders):
        for order_value in orders:
            order_value['order_fields_extend'] = {}
            order_value['included_order_fields_extend'] = False
            order_value['delivery_fields_extend'] = {}
            order_value['included_delivery_fields_extend'] = False
            order_value['invoice_fields_extend'] = {}
            order_value['included_invoice_fields_extend'] = False
            order = self.browse(order_value['id'])
            order.pos_compute_loyalty_point()
            order.create_picking_variants()
            if order.add_credit and order.amount_total < 0:
                order.add_credit_to_customer(- order.amount_total)
            if order.config_id.add_order_fields_to_receipt:
                field_description_by_name = {}
                field_format_datetime = []
                fields_read = []
                for fd in order.config_id.add_order_fields_to_receipt:
                    field_description_by_name[fd.name] = fd.field_description
                    fields_read.append(fd.name)
                    if fd.ttype in ['date', 'datetime']:
                        field_format_datetime.append(fd.name)
                values = \
                    order.sudo().with_context(tz=self.env.user.tz).search_read([('id', '=', order.id)], fields_read)[0]
                for field, value in values.items():
                    if field == 'id' or not value:
                        continue
                    if field in field_format_datetime:
                        value = self.env['pos.session'].get_session_date(value)
                    order_value['order_fields_extend'][field_description_by_name[field]] = value
                order_value['included_order_fields_extend'] = True
            if order.picking_ids and order.config_id.add_picking_field_to_receipt:
                picking = order.picking_ids[0]
                order_value['picking_ref'] = picking.read([order.config_id.add_picking_field_to_receipt])[
                    0].get(order.config_id.add_picking_field_to_receipt)
            if order.picking_ids and order.config_id.add_picking_fields_to_receipt:
                field_description_by_name = {}
                field_format_datetime = []
                fields_read = []
                for fd in order.config_id.add_picking_fields_to_receipt:
                    field_description_by_name[fd.name] = fd.field_description
                    fields_read.append(fd.name)
                    if fd.ttype in ['date', 'datetime']:
                        field_format_datetime.append(fd.name)
                picking = order.picking_ids[0].sudo()
                values = picking.with_context(tz=self.env.user.tz).search_read(
                    [('id', '=', picking.id)], fields_read)[0]
                for field, value in values.items():
                    if field == 'id' or not value:
                        continue
                    if field in field_format_datetime:
                        value = self.env['pos.session'].get_session_date(value)
                    order_value['delivery_fields_extend'][field_description_by_name[field]] = value
                order_value['included_delivery_fields_extend'] = True
            if order.account_move and order.config_id.add_invoice_field_to_receipt:
                order_value['invoice_ref'] = order.account_move.read([order.config_id.add_invoice_field_to_receipt])[
                    0].get(order.config_id.add_invoice_field_to_receipt)
            if order.account_move and order.config_id.add_invoices_field_to_receipt:
                field_description_by_name = {}
                field_format_datetime = []
                fields_read = []
                for fd in order.config_id.add_invoices_field_to_receipt:
                    field_description_by_name[fd.name] = fd.field_description
                    fields_read.append(fd.name)
                    if fd.ttype in ['date', 'datetime']:
                        field_format_datetime.append(fd.name)
                values = order.account_move.sudo().with_context(tz=self.env.user.tz).search_read(
                    [('id', '=', order.account_move.id)], fields_read)[0]
                for field, value in values.items():
                    if field == 'id' or not value:
                        continue
                    if field in field_format_datetime:
                        value = self.env['pos.session'].get_session_date(value)
                    order_value['invoice_fields_extend'][field_description_by_name[field]] = value
                order_value['included_invoice_fields_extend'] = True
            order_value['ean13'] = order['ean13']
        return orders

    def pos_compute_loyalty_point(self):
        if self.partner_id and self.config_id and self.config_id.pos_loyalty_id and (
                self.redeem_point or self.plus_point):
            self.env.cr.execute("select id from pos_loyalty_point where order_id=%s and type='plus'" % self.id)
            have_plus = self.env.cr.fetchall()
            self.env.cr.execute("select id from pos_loyalty_point where order_id=%s and type='redeem'" % self.id)
            have_redeem = self.env.cr.fetchall()
            vals_point = {
                'loyalty_id': self.config_id.pos_loyalty_id.id,
                'order_id': self.id,
                'partner_id': self.partner_id.id,
                'state': 'ready',
                'is_return': self.is_return if self.is_return else False,
            }
            if self.plus_point and len(have_plus) == 0:
                vals_point.update({
                    'point': self.plus_point,
                    'type': 'plus'
                })
                self.env['pos.loyalty.point'].create(vals_point)
            if self.redeem_point and len(have_redeem) == 0:
                vals_point.update({
                    'point': self.redeem_point,
                    'type': 'redeem'
                })
                self.env['pos.loyalty.point'].create(vals_point)

    @api.model
    def add_credit_to_customer(self, amount):
        if self.partner_id:
            self.env['res.partner.credit'].create({
                'name': self.name,
                'type': 'plus',
                'amount': amount,
                'pos_order_id': self.id,
                'partner_id': self.partner_id.id,
            })
        else:
            return False

    def create_picking_generic_options(self):
        Picking = self.env['stock.picking']
        if not self.env.user.partner_id.email:
            Picking = Picking.with_context(tracking_disable=True)
        Move = self.env['stock.move']
        StockWarehouse = self.env['stock.warehouse']
        for order in self:
            lines_has_save_generic_options = order.lines.filtered(lambda l: len(l.generic_option_ids) != 0)
            if not lines_has_save_generic_options:
                continue
            address = order.partner_id.address_get(['delivery']) or {}
            picking_type = order.picking_type_id
            return_pick_type = order.picking_type_id.return_picking_type_id or order.picking_type_id
            order_picking = Picking
            return_picking = Picking
            moves = Move
            location_id = picking_type.default_location_src_id.id
            if order.partner_id:
                destination_id = order.partner_id.property_stock_customer.id
            else:
                if (not picking_type) or (not picking_type.default_location_dest_id):
                    customerloc, supplierloc = StockWarehouse._get_partner_locations()
                    destination_id = customerloc.id
                else:
                    destination_id = picking_type.default_location_dest_id.id

            if picking_type:
                message = _(
                    "This transfer has been created from the point of sale session: <a href=# data-oe-model=pos.order data-oe-id=%d>%s</a>") % (
                              order.id, order.name)
                picking_vals = {
                    'pos_order_id': order.id,
                    'pos_session_id': order.session_id.id,
                    'origin': order.name,
                    'partner_id': address.get('delivery', False),
                    'user_id': False,
                    'date_done': order.date_order,
                    'picking_type_id': picking_type.id,
                    'company_id': order.company_id.id,
                    'move_type': 'direct',
                    'note': order.note or "",
                    'location_id': location_id,
                    'location_dest_id': destination_id,
                }
                pos_qty = any([x.qty > 0 for x in order.lines])
                if pos_qty:
                    order_picking = Picking.create(picking_vals.copy())
                    if self.env.user.partner_id.email:
                        order_picking.message_post(body=message)
                    else:
                        order_picking.sudo().message_post(body=message)
                neg_qty = any([x.qty < 0 for x in order.lines])
                if neg_qty:
                    return_vals = picking_vals.copy()
                    return_vals.update({
                        'location_id': destination_id,
                        'location_dest_id': return_pick_type != picking_type and return_pick_type.default_location_dest_id.id or location_id,
                        'picking_type_id': return_pick_type.id
                    })
                    return_picking = Picking.create(return_vals)
                    if self.env.user.partner_id.email:
                        return_picking.message_post(body=message)
                    else:
                        return_picking.sudo().message_post(body=message)

            for line in lines_has_save_generic_options:
                for generic_option in line.generic_option_ids:
                    for material in generic_option.material_ids:
                        if material.quantity <= 0:
                            continue
                        moves |= Move.create({
                            'name': line.name,
                            'product_uom': material.product_id.uom_id.id,
                            'picking_id': order_picking.id if line.qty >= 0 else return_picking.id,
                            'picking_type_id': picking_type.id if line.qty >= 0 else return_pick_type.id,
                            'product_id': material.product_id.id,
                            'product_uom_qty': abs(material.quantity * line.qty),
                            'state': 'draft',
                            'location_id': location_id if line.qty >= 0 else destination_id,
                            'location_dest_id': destination_id if line.qty >= 0 else return_pick_type != picking_type and return_pick_type.default_location_dest_id.id or location_id,
                        })

            newPicking = None
            if return_picking:
                newPicking = return_picking
            if order_picking:
                newPicking = order_picking
            newPicking.action_assign()
            for move in newPicking.move_lines.filtered(lambda m: m.state not in ['done', 'cancel']):
                for move_line in move.move_line_ids:
                    move_line.qty_done = move_line.product_uom_qty
            newPicking.button_validate()
        return True

    # def _create_order_picking(self):
    #     if self.picking_ids:
    #         return True
    #     res = super(POSOrder, self.with_context({'pos_coming': True}))._create_order_picking()
    #     return res

    def create_picking_dynamic_combo_items(self, combo_item_dict):
        if combo_item_dict:
            wareHouseObject = self.env['stock.warehouse']
            stockMoveObject = self.env['stock.move']
            moves = stockMoveObject
            stockPickingObject = self.env['stock.picking']
            picking_type = self.picking_type_id
            location_id = self.location_id.id
            if self.partner_id:
                destination_id = self.partner_id.property_stock_customer.id
            else:
                if (not picking_type) or (not picking_type.default_location_dest_id):
                    customerloc, supplierloc = wareHouseObject._get_partner_locations()
                    destination_id = customerloc.id
                else:
                    destination_id = picking_type.default_location_dest_id.id
            is_return = self.is_return
            picking_vals = {
                'is_picking_combo': True,
                'user_id': False,
                'origin': self.pos_reference,
                'partner_id': self.partner_id.id if self.partner_id else None,
                'date_done': self.date_order,
                'picking_type_id': picking_type.id,
                'company_id': self.company_id.id,
                'move_type': 'direct',
                'note': self.note or "",
                'location_id': location_id if not is_return else destination_id,
                'location_dest_id': destination_id if not is_return else location_id,
                'pos_order_id': self.id,
            }
            picking_combo = stockPickingObject.create(picking_vals)
            for product_id, quantity in combo_item_dict.items():
                product = self.env['product.product'].browse(product_id)
                vals = {
                    'name': self.name,
                    'product_uom': product.uom_id.id,
                    'picking_id': picking_combo.id,
                    'picking_type_id': picking_type.id,
                    'product_id': product_id,
                    'product_uom_qty': quantity,
                    'state': 'draft',
                    'location_id': location_id if not is_return else destination_id,
                    'location_dest_id': destination_id if not is_return else location_id,
                }
                move = stockMoveObject.create(vals)
                moves |= move
            picking_combo.action_assign()
            for move in picking_combo.move_lines.filtered(lambda m: m.state not in ['done', 'cancel']):
                for move_line in move.move_line_ids:
                    move_line.qty_done = move_line.product_uom_qty
            picking_combo.button_validate()
        return True

    def create_picking_variants(self):
        lines_included_variants = self.lines.filtered(
            lambda l: len(l.variant_ids) > 0)
        if lines_included_variants:
            condition_create_picking = False
            for order_line in lines_included_variants:
                for variant_item in order_line.variant_ids:
                    if variant_item.product_id:
                        condition_create_picking = True
                        break
            if not condition_create_picking:
                return True
            wareHouseObject = self.env['stock.warehouse']
            stockMoveObject = self.env['stock.move']
            moves = stockMoveObject
            stockPickingObject = self.env['stock.picking']
            picking_type = self.picking_type_id
            location_id = self.location_id.id
            if self.partner_id:
                destination_id = self.partner_id.property_stock_customer.id
            else:
                if (not picking_type) or (not picking_type.default_location_dest_id):
                    customerloc, supplierloc = wareHouseObject._get_partner_locations()
                    destination_id = customerloc.id
                else:
                    destination_id = picking_type.default_location_dest_id.id
            is_return = self.is_return
            picking_vals = {
                'name': self.name + '- Variants',
                'origin': self.name,
                'partner_id': self.partner_id.id if self.partner_id else None,
                'date_done': self.date_order,
                'picking_type_id': picking_type.id,
                'company_id': self.company_id.id,
                'move_type': 'direct',
                'note': self.note or "",
                'location_id': location_id if not is_return else destination_id,
                'location_dest_id': destination_id if not is_return else location_id,
                'pos_order_id': self.id,
            }
            newPicking = stockPickingObject.create(picking_vals)
            _logger.info('new picking variant %s' % newPicking.id)
            for order_line in lines_included_variants:
                for variant_item in order_line.variant_ids:
                    if not variant_item.product_id:
                        continue
                    product = variant_item.product_id
                    order_line_qty = order_line.qty
                    move = stockMoveObject.create({
                        'name': self.name,
                        'product_uom': product.uom_id.id,
                        'picking_id': newPicking.id,
                        'picking_type_id': picking_type.id,
                        'product_id': product.id,
                        'product_uom_qty': abs(variant_item.quantity * order_line_qty),
                        'state': 'draft',
                        'location_id': location_id if not is_return else destination_id,
                        'location_dest_id': destination_id if not is_return else location_id,
                    })
                    moves |= move
            newPicking.action_assign()
            for move in newPicking.move_lines.filtered(lambda m: m.state not in ['done', 'cancel']):
                for move_line in move.move_line_ids:
                    move_line.qty_done = move_line.product_uom_qty
            newPicking.button_validate()
        return True

    @api.model
    def _payment_fields(self, order, ui_paymentline):
        payment_fields = super(POSOrder, self)._payment_fields(order, ui_paymentline)
        if ui_paymentline.get('voucher_id', None):
            payment_fields['voucher_id'] = ui_paymentline.get('voucher_id')
        if ui_paymentline.get('ref', None):
            payment_fields['ref'] = ui_paymentline.get('ref')
        if ui_paymentline.get('cheque_owner', None):
            payment_fields['cheque_owner'] = ui_paymentline.get('cheque_owner')
        if ui_paymentline.get('cheque_bank_account', None):
            payment_fields['cheque_bank_account'] = ui_paymentline.get('cheque_bank_account')
        if ui_paymentline.get('cheque_bank_id', None):
            payment_fields['cheque_bank_id'] = ui_paymentline.get('cheque_bank_id')
        if ui_paymentline.get('cheque_check_number', None):
            payment_fields['cheque_check_number'] = ui_paymentline.get('cheque_check_number')
        if ui_paymentline.get('cheque_card_name', None):
            payment_fields['cheque_card_name'] = ui_paymentline.get('cheque_card_name')
        if ui_paymentline.get('cheque_card_number', None):
            payment_fields['cheque_card_number'] = ui_paymentline.get('cheque_card_number')
        if ui_paymentline.get('cheque_card_type', None):
            payment_fields['cheque_card_type'] = ui_paymentline.get('cheque_card_type')
        return payment_fields


class POSOrderLine(models.Model):
    _inherit = "pos.order.line"

    coupon_program_id = fields.Many2one(
        'coupon.program',
        'Coupon Program',
        readonly=1
    )
    coupon_id = fields.Many2one(
        'coupon.coupon',
        'Coupon',
        readonly=1
    )
    coupon_ids = fields.Many2many(
        'coupon.coupon',
        'coupon_coupon_gift_card_rel',
        'pos_line_id',
        'coupon_id',
        string='Gift Cards',
        readonly=1
    )
    plus_point = fields.Float('Plus Point', readonly=1)
    redeem_point = fields.Float('Redeem Point', readonly=1)
    partner_id = fields.Many2one(
        'res.partner',
        related='order_id.partner_id',
        string='Partner',
        readonly=1)
    promotion = fields.Boolean('Applied Promotion', readonly=1)
    promotion_id = fields.Many2one('pos.promotion', 'Promotion', readonly=1, ondelete="set null")
    promotion_reason = fields.Char(string='Promotion Reason', readonly=1)
    is_return = fields.Boolean('Is Return')
    order_uid = fields.Text('order_uid', readonly=1)
    user_id = fields.Many2one('res.users', 'Sale Person')
    session_info = fields.Text('session_info', readonly=1)
    uid = fields.Text('uid', readonly=1)
    variant_ids = fields.Many2many(
        'product.variant',
        'order_line_variant_rel',
        'line_id', 'variant_id',
        string='Variant Items', readonly=1)
    tag_ids = fields.Many2many(
        'pos.tag',
        'pos_order_line_tag_rel',
        'line_id',
        'tag_id',
        string='Tags / Reasons Return')
    note = fields.Text('Note')
    discount_reason = fields.Char('Discount Reason')
    margin = fields.Float(
        'Margin',
        compute='_compute_multi_margin',
        store=True
    )
    margin_percent = fields.Float(
        'Margin %',
        compute='_compute_multi_margin',
        store=True
    )
    purchase_price = fields.Float(
        'Cost Price',
        compute='_compute_multi_margin',
        store=True
    )
    reward_id = fields.Many2one('pos.loyalty.reward', 'Reward')
    packaging_id = fields.Many2one('product.packaging', string='Package/Box')
    config_id = fields.Many2one(
        'pos.config',
        related='order_id.session_id.config_id',
        string="Point of Sale")
    pos_branch_id = fields.Many2one(
        'pos.branch',
        related='order_id.pos_branch_id',
        string='Branch',
        readonly=1,
        index=True,
        store=True)
    manager_user_id = fields.Many2one('res.users', 'Manager Approved')
    analytic_account_id = fields.Many2one(
        'account.analytic.account',
        related='order_id.analytic_account_id',
        store=True,
        readonly=1,
        string='Analytic Account'
    )
    returned_qty = fields.Float('Returned Qty')
    returned_order_line_id = fields.Many2one('pos.order.line', 'Returned from Line')
    uom_id = fields.Many2one('uom.uom', 'Sale Uom', readonly=1)
    product_uom_id = fields.Many2one('uom.uom', string='Product UoM', related=None)
    generic_option_ids = fields.Many2many(
        'product.generic.option',
        'pos_line_generic_option_rel',
        'line_id',
        'generic_option_id',
        string='Generic Options'
    )
    pos_bom_id = fields.Many2one('mrp.bom', 'Bom Added', readonly=1)
    mrp_production_id = fields.Many2one('mrp.production', 'MRP Order')
    is_shipping_cost = fields.Boolean('Shipping Cost')
    order_time = fields.Char('Order Time')
    price_extra = fields.Float('Discount Value')

    def getProductRecommendations(self, product_id=None, product_recommendation_number=10):
        OrderLines = self.search([('product_id', '=', product_id)], limit=product_recommendation_number,
                                 order='create_date DESC')
        OrderIds = []
        ProductIds = []
        for line in OrderLines:
            if line.id not in OrderIds:
                OrderIds.append(line.order_id.id)
        OrderLines = self.search([('product_id', '!=', product_id), ('order_id', 'in', OrderIds)],
                                 limit=product_recommendation_number, order='create_date DESC')
        for line in OrderLines:
            if line.product_id.id not in ProductIds:
                ProductIds.append(line.product_id.id)
            if len(ProductIds) >= product_recommendation_number:
                break
        return ProductIds

    @api.depends('product_id', 'qty', 'price_subtotal', 'order_id.note')
    def _compute_multi_margin(self):
        for line in self:
            if line.qty <= 0:
                continue
            if line.price_subtotal <= 0:
                line.purchase_price = 0
                line.margin = 0
                line.margin_percent = 0
                continue
            if not line.product_id:
                line.purchase_price = 0
                line.margin = 0
                line.margin_percent = 0
            else:
                line.purchase_price = line.product_id.standard_price
                line.margin = line.price_subtotal - (
                        line.product_id.standard_price * line.qty)
                if line.product_id.standard_price <= 0:
                    line.margin_percent = 100
                else:
                    line.margin_percent = (
                                                  line.price_subtotal / line.qty - line.product_id.standard_price) / line.product_id.standard_price * 100

    def _order_line_fields(self, line, session_id=None):
        values = super(POSOrderLine, self)._order_line_fields(line, session_id)
        if line[2].get('combo_item_ids', []):
            values[2].update({'combo_item_ids': line[2].get('combo_item_ids', [])})
        if line[2].get('generic_option_ids', []):
            values[2].update({'generic_option_ids': line[2].get('generic_option_ids', [])})
        if line[2].get('selected_combo_items', []):
            values[2].update({'selected_combo_items': line[2].get('selected_combo_items', [])})
        if line[2].get('voucher', None):
            values[2].update({'voucher': line[2].get('voucher', [])})
        if line[2].get('bom_lines', []):
            values[2].update({'bom_lines': line[2].get('bom_lines', [])})
        if line[2].get('mrp_production_id', []):
            values[2].update({'mrp_production_id': line[2].get('mrp_production_id', [])})
        if line[2].get('is_shipping_cost', False):
            values[2].update({'is_shipping_cost': line[2].get('is_shipping_cost', False)})
        if line[2].get('addon_ids', False):
            values[2].update({'addon_ids': line[2].get('addon_ids', False)})
        if line[2].get('price_extra', None):
            values[2].update({'price_extra': line[2].get('price_extra', 0)})
        if line[2].get('bom_lines', None):
            values[2].update({'bom_lines': line[2].get('bom_lines', [])})
        return values

    # TODO: cashier add voucher variable to each line, backend automatic create voucher
    def _add_voucher(self, order, voucher_vals=[]):
        today = datetime.today()
        if voucher_vals.get('period_days', None):
            end_date = today + timedelta(days=int(voucher_vals['period_days']))
        else:
            end_date = today + timedelta(days=order.config_id.expired_days_voucher)
        self.env['pos.voucher'].sudo().create({
            'number': voucher_vals.get('number', None) if voucher_vals.get('number', None) else '',
            'customer_id': voucher_vals.get('customer_id', None) if voucher_vals.get('customer_id', None) else None,
            'start_date': fields.Datetime.now(),
            'end_date': end_date,
            'state': 'active',
            'value': voucher_vals['value'],
            'apply_type': voucher_vals.get('apply_type', None) if voucher_vals.get('apply_type',
                                                                                   None) else 'fixed_amount',
            'method': voucher_vals.get('method', None) if voucher_vals.get('method', None) else 'general',
            'source': order.name,
            'pos_order_id': order.id,
            'pos_order_line_id': self.id,
            'user_id': self.env.user.id
        })

    @api.model
    def create(self, vals):
        voucher_vals = {}
        bom_lines = None
        if vals.get('voucher', {}):
            voucher_vals = vals.get('voucher')
            del vals['voucher']
        if vals.get('mp_skip', {}):
            del vals['mp_skip']
        if 'voucher' in vals:
            del vals['voucher']
        if 'bom_lines' in vals:
            bom_lines = vals.get('bom_lines')
            del vals['bom_lines']
        order = self.env['pos.order'].browse(vals['order_id'])
        if order.booking_id and order.booking_id.state != 'booked':
            order.booking_id.write({
                'pos_order_id': order.id,
                'payment_partial_amount': 0,
                'state': 'booked'
            })
        if order.pos_branch_id:
            vals.update({'pos_branch_id': order.pos_branch_id.id})
        else:
            vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
        if vals.get('uom_id', None):
            vals.update({'product_uom_id': vals.get('uom_id')})
        else:
            product = self.env['product.product'].browse(vals.get('product_id'))
            vals.update({
                'product_uom_id': product.uom_id.id,
                'uom_id': product.uom_id.id,
            })
        po_line = super(POSOrderLine, self).create(vals)
        if voucher_vals:
            po_line._add_voucher(order, voucher_vals)
        if po_line.product_id.is_credit and not po_line.order_id.add_credit:
            po_line.order_id.add_credit_to_customer(po_line.price_subtotal_incl)
        if po_line.returned_order_line_id:
            po_line.returned_order_line_id.write({'returned_qty': po_line.qty})
        if po_line.coupon_ids:
            po_line.coupon_ids.sudo().write({
                'state': 'new',
                'pos_orderline_id': po_line.id
            })
        if po_line.coupon_id:
            coupon = po_line.coupon_id
            if not coupon.is_gift_card or (coupon.is_gift_card and coupon.balance_amount <= 0):
                if not coupon.is_gift_card:
                    self.env['coupon.coupon'].browse(vals.get('coupon_id')).write({
                        'state': 'used',
                        'pos_order_id': vals.get('order_id'),
                    })
                else:
                    self.env['coupon.coupon'].browse(vals.get('coupon_id')).write({
                        'state': 'used',
                    })
        if bom_lines:
            po_line.create_picking_for_bom_lines(po_line.order_id, bom_lines)
        return po_line

    def create_picking_for_bom_lines(self, order, bom_lines):
        if bom_lines:
            wareHouseObject = self.env['stock.warehouse']
            stockMoveObject = self.env['stock.move']
            moves = stockMoveObject
            stockPickingObject = self.env['stock.picking']
            picking_type = order.picking_type_id
            location_id = order.location_id.id
            if order.partner_id:
                destination_id = order.partner_id.property_stock_customer.id
            else:
                if (not picking_type) or (not picking_type.default_location_dest_id):
                    customerloc, supplierloc = wareHouseObject._get_partner_locations()
                    destination_id = customerloc.id
                else:
                    destination_id = picking_type.default_location_dest_id.id
            is_return = order.is_return
            picking_vals = {
                'is_picking_combo': True,
                'user_id': False,
                'origin': order.pos_reference,
                'partner_id': order.partner_id.id if order.partner_id else None,
                'date_done': order.date_order,
                'picking_type_id': picking_type.id,
                'company_id': order.company_id.id,
                'move_type': 'direct',
                'note': order.note or "",
                'location_id': location_id if not is_return else destination_id,
                'location_dest_id': destination_id if not is_return else location_id,
                'pos_order_id': order.id,
                'pos_session_id': order.session_id.id,
            }
            picking = stockPickingObject.create(picking_vals)
            for bom_value in bom_lines:
                product_id = None
                bomLine = None
                if not bom_value.get('product_id', None):
                    bomLine = self.env['mrp.bom.line'].browse(bom_value.get('id'))
                    product_id = bomLine.product_id.id
                else:
                    product_id = bom_value.get('product_id')[0]
                quantity = bom_value.get('quantity')
                product = self.env['product.product'].browse(product_id)
                vals = {
                    'name': order.name,
                    'product_uom': product.uom_id.id,
                    'picking_id': picking.id,
                    'picking_type_id': picking_type.id,
                    'product_id': product_id,
                    'product_uom_qty': quantity * self.qty,
                    'state': 'draft',
                    'location_id': location_id if not is_return else destination_id,
                    'location_dest_id': destination_id if not is_return else location_id,
                }
                move = stockMoveObject.create(vals)
                moves |= move
            picking.action_assign()
            for move in picking.move_lines.filtered(lambda m: m.state not in ['done', 'cancel']):
                for move_line in move.move_line_ids:
                    move_line.qty_done = move_line.product_uom_qty
            picking.button_validate()
        return True

    def action_create_mrp_production_direct_from_pos(self, config_id, pos_reference, product_id, quantity, bom_lines):
        """
        {
            'date_planned_finished': '2020-09-14 03:08:56',
            'is_locked': False,
            'priority': '0',
            'product_id': 32,
            'product_description_variants': False,
            'qty_producing': 0,
            'product_qty': 1,
            'product_uom_id': 1,
            'lot_producing_id': False,
            'bom_id': 7,
            'date_planned_start': '2020-09-14 02:08:56',
            'user_id': 2,
            'company_id': 1,
            'move_finished_ids': [
            [0, 'virtual_678', {
            'name': 'New', 'company_id': 1, 'product_id': 32,
                                                                       'product_uom_qty': 1, 'product_uom': 1,
                                                                       'location_id': 15, 'location_dest_id': 8,
                                                                       'move_dest_ids': [[6, False, []]],
                                                                       'origin': 'New',
                                                                       'group_id': False, 'propagate_cancel': False,
                                                                       'picking_type_id': 13, 'warehouse_id': 1,
                                                                       'operation_id': False, 'byproduct_id': False}]],
            'move_raw_ids': [[0, 'virtual_676',
                              {'name': 'New', 'sequence': 1, 'date': '2020-09-14 02:08:56', 'company_id': 1,
                               'product_id': 48, 'product_uom_qty': 1, 'product_uom': 1, 'location_id': 8,
                               'location_dest_id': 15, 'state': 'draft', 'picking_type_id': 13, 'warehouse_id': 1,
                               'quantity_done': 0, 'additional': False, 'lot_ids': [[6, False, []]],
                               'operation_id': False,
                               'bom_line_id': 14}], [0, 'virtual_677',
                                                     {'name': 'New', 'sequence': 2, 'date': '2020-09-14 02:08:56',
                                                      'company_id': 1, 'product_id': 49, 'product_uom_qty': 1,
                                                      'product_uom': 1, 'location_id': 8, 'location_dest_id': 15,
                                                      'state': 'draft', 'picking_type_id': 13, 'warehouse_id': 1,
                                                      'quantity_done': 0, 'additional': False,
                                                      'lot_ids': [[6, False, []]],
                                                      'operation_id': False, 'bom_line_id': 15}]],
            'picking_type_id': 13,
            'location_src_id': 8, 'location_dest_id': 8, 'origin': False, 'name': 'WH/MO/00010',
            'procurement_group_id': 21
        }
        """
        _logger.info('Begin action_create_mrp_production_direct_from_pos')
        _logger.info('Processing Bom Lines {}'.format(bom_lines))
        Production = self.env['mrp.production'].sudo()
        bom_line = self.env['mrp.bom.line'].sudo().browse(bom_lines[0].get('id'))
        bom = bom_line.bom_id
        picking_type_id = bom.picking_type_id.id if bom.picking_type_id else Production._get_default_picking_type()
        product = self.env['product.product'].browse(product_id)
        production_vals = {
            'bom_id': bom.id,
            'product_id': product_id,
            'product_qty': quantity,
            'product_tmpl_id': product.product_tmpl_id.id,
            'origin': pos_reference,
            'product_uom_id': product.uom_id.id,
            'user_id': self.env.user.id,
            'company_id': self.env.user.company_id.id,
            'picking_type_id': picking_type_id,
        }
        _logger.info('Created new Production {}'.format(production_vals))
        mrp_order = self.env['mrp.production'].sudo().create(production_vals)
        for bom_line in bom_lines:
            bom_line_record = self.env['mrp.bom.line'].sudo().browse(bom_line.get('id'))
            move_vals = {
                'raw_material_production_id': mrp_order.id,
                'name': mrp_order.name,
                'product_id': bom_line_record.product_id.id,
                'product_uom': bom_line_record.product_uom_id.id,
                'product_uom_qty': bom_line.get('quantity') * quantity,
                'picking_type_id': picking_type_id,
                'location_id': Production._get_default_location_src_id(),
                'location_dest_id': bom_line_record.product_id.with_context(
                    force_company=self.company_id.id).property_stock_production.id,
                'company_id': mrp_order.company_id.id,
            }
            self.env['stock.move'].sudo().create(move_vals)
        _logger.info('MRP Order created: {}'.format(mrp_order.id))
        _logger.info('END action_create_mrp_production_direct_from_pos')
        return {
            'name': mrp_order.name,
            'state': mrp_order.state,
            'id': mrp_order.id,
            'product_id': product_id
        }

    def get_purchased_lines_histories_by_partner_id(self, partner_id):
        orders = self.env['pos.order'].sudo().search([('partner_id', '=', partner_id)], order='create_date DESC')
        fields_sale_load = self.env['pos.cache.database'].sudo().get_fields_by_model('pos.order.line')
        vals = []
        if orders:
            order_ids = [order.id for order in orders]
            lines = self.sudo().search([('order_id', 'in', order_ids)])
            return lines.read(fields_sale_load)
        else:
            return vals

    def unlink(self):
        for line in self:
            if line.order_id and line.order_id.state == 'cancel' and line.order_id.removed_user_id and not self.env.user.has_group(
                    'point_of_sale.group_pos_manager'):
                raise UserError(_(
                    "You can not remove this order, only POS Manager can do it"))
        return super(POSOrderLine, self).unlink()
