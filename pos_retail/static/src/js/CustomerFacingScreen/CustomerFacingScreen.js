odoo.define('pos_retail.ClientScreenWidget', function (require) {
    var models = require('point_of_sale.models');
    var core = require('web.core');
    var QWeb = core.qweb;

    var _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        initialize: function (session, attributes) {
            var self = this;
            _super_PosModel.initialize.apply(this, arguments);
            this.bind('change:selectedOrder', function () {
                self._do_update_customer_screen();
            });
            this.bind('refresh.customer.facing.screen', function () {
                self._do_update_customer_screen();
            });
        },
        get_logo: function () { // return logo for posticket web and header top - right
            if (this.config.logo) {
                return 'data:image/png;base64, ' + this.config.logo
            } else {
                return 'data:image/png;base64, ' + this.company.logo
            }
        },
        save_facing_screen: function (facing_screen_html) {
            var self = this;
            localStorage['facing_screen'] = '';
            localStorage['facing_screen'] = facing_screen_html
        },
        _do_update_customer_screen: function () {
            if (this.config.customer_facing_screen) {
                var self = this;
                this.render_html_for_customer_facing_display().then(function (rendered_html) {
                    self.save_facing_screen(rendered_html);
                });
            }
        },
        send_current_order_to_customer_facing_display: function () {
            this._do_update_customer_screen();
            var self = this;
            this.render_html_for_customer_facing_display().then(function (rendered_html) {
                self.proxy.update_customer_facing_display(rendered_html);
            });
        },
        render_html_for_customer_facing_display: function () { // TODO: we add shop logo to customer screen
            var self = this;
            var order = this.get_order();
            var rendered_html = this.config.customer_facing_display_html;
            var get_image_promises = [];

            if (order) {
                order.get_orderlines().forEach(function (orderline) {
                    var product = orderline.product;
                    var image_url = window.location.origin + '/web/image?model=product.product&field=image_128&id=' + product.id;
                    if (!product.image_base64) {
                        get_image_promises.push(self._convert_product_img_to_base64(product, image_url));
                    }
                });
            }

            // when all images are loaded in product.image_base64
            return Promise.all(get_image_promises).then(function () {
                var rendered_order_lines = "";
                var rendered_payment_lines = "";
                var order_total_with_tax = self.format_currency(0);

                if (order) {
                    rendered_order_lines = QWeb.render('CustomerFacingDisplayOrderLines', {
                        'pos': self.env.pos,
                        'orderlines': order.get_orderlines(),
                    });
                    rendered_payment_lines = QWeb.render('CustomerFacingDisplayPaymentLines', {
                        'order': order,
                        'pos': self.env.pos,
                    });
                    order_total_with_tax = self.format_currency(order.get_total_with_tax());
                }
                var $rendered_html = $(rendered_html);
                $rendered_html.find('.pos_orderlines_list').html(rendered_order_lines);
                $rendered_html.find('.pos-total').find('.pos_total-amount').html(order_total_with_tax);
                var pos_change_title = $rendered_html.find('.pos-change_title').text();
                $rendered_html.find('.pos-paymentlines').html(rendered_payment_lines);
                $rendered_html.find('.pos-change_title').text(pos_change_title);
                if (order && order.get_client()) {
                    $rendered_html.find('.pos-total').find('.client-name').html(order.get_client().name);
                    $rendered_html.find('.pos-total').find('.client-points').html(self.format_currency_no_symbol(order.get_client().pos_loyalty_point));
                }
                if (order) {
                    let discount = self.format_currency(order.get_total_discount())
                    $rendered_html.find('.pos-total').find('.pos_total-discount').html(discount);
                }
                if (order) {
                    $rendered_html.find('.pos-total').find('.pos_total-taxes').html(self.format_currency(order.get_total_tax()));
                }
                var logo_base64 = self.get_logo();
                // var image_html = '<img src="' + logo_base64 + '" class="logo-shop" style="width: 100%">';
                // $rendered_html.find('.pos-company_logo').html(image_html);
                // prop only uses the first element in a set of elements,
                // and there's no guarantee that
                // customer_facing_display_html is wrapped in a single
                // root element.
                rendered_html = _.reduce($rendered_html, function (memory, current_element) {
                    return memory + $(current_element).prop('outerHTML');
                }, ""); // initial memory of ""

                rendered_html = QWeb.render('CustomerFacingDisplayHead', {
                    origin: window.location.origin
                }) + rendered_html;
                return rendered_html;
            });
        },
    });

    var _super_order = models.Order.prototype;
    models.Order = models.Order.extend({
        initialize: function (attributes, options) {
            var self = this;
            var res = _super_order.initialize.apply(this, arguments);
            this.bind('add', function (order) {
                self.pos._do_update_customer_screen();
            });
            return res;
        }
    });
});
