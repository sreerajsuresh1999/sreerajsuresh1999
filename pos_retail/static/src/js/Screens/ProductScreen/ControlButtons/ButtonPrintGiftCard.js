odoo.define('pos_retail.ButtonPrintGiftCard', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonPrintGiftCard extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        async onClick() {
            const selectedOrder = this.env.pos.get_order()
            const selectedLine = selectedOrder.get_selected_orderline();
            let lists = this.env.pos.couponGiftCardTemplate.filter(t => t.reward.discount_fixed_amount > 0 && t.program_type == 'coupon_program' && t.reward.discount_type == 'fixed_amount').map((t) => ({
                id: t.id,
                item: t,
                name: t.name + this.env._t(' with Amount ') + this.env.pos.format_currency(t.reward.discount_fixed_amount)
            }))
            if (lists.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Have not Gift Card Template with amount: ') + this.env.pos.format_currency(selectedLine.get_price_with_tax() / selectedLine.quantity) + this.env._t('. Please go to menu Sale / Product / Gift Card Template: Create 1 template with Fixed Amount the same with amount of Selected Line and add it to POS Config / Gift Card can Create from POS')
                })
            }
            let {confirmed, payload: selectedItems} = await this.showPopup(
                'PopUpSelectionBox',
                {
                    title: this.env._t('Select 1 Coupon Program for create new Gift Card !!!'),
                    items: lists,
                    onlySelectOne: true,
                }
            );
            if (confirmed && selectedItems['items'].length > 0) {
                const couponProgram = selectedItems['items'][0]['item']
                let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                    title: this.env._t('How Many Gift Card need create ?'),
                    startingValue: 1
                })
                if (confirmed) {
                    const totalGiftNumber = parseInt(number)
                    let validate = true
                    if (this.env.pos.config.validate_coupon) {
                        validate = await this.env.pos._validate_action(this.env._t(' Request your Manager approve create ') + totalGiftNumber + this.env._t(' Gift Card, with Amount fixed is: ') + this.env.pos.format_currency(couponProgram.reward.discount_fixed_amount));
                    }
                    if (!validate) {
                        return false;
                    } else {
                        const wizardID = await this.rpc({
                            model: 'coupon.generate.wizard',
                            method: 'create',
                            args: [
                                {
                                    nbr_coupons: totalGiftNumber,
                                    generation_type: 'nbr_coupon',
                                    partners_domain: []
                                }
                            ]
                        })
                        let partner_id = null;
                        const selectedCustomer = selectedOrder.get_client();
                        let default_mobile_no = ''
                        if (selectedCustomer) {
                            partner_id = selectedCustomer.id
                            default_mobile_no = selectedCustomer['mobile'] || selectedOrder['phone']
                        }
                        let coupon_ids = await this.rpc({
                            model: 'coupon.generate.wizard',
                            method: 'generate_giftcards',
                            args: [[wizardID], partner_id, this.env.pos.config.id],
                            context: {
                                active_id: couponProgram.id,
                                active_ids: [couponProgram.id]
                            }
                        })
                        if (selectedLine) { // todo: if have selectedLine and this selectedLine submited to backend, all coupon linked to this line automatic set state to new
                            selectedLine.coupon_ids = coupon_ids;
                            selectedLine.trigger('change', selectedLine);
                        }
                        let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                            title: this.env._t('Finish created Coupon/Gift Cards'),
                            body: this.env._t('Gift Cards just created not ready for use on next Order, Gifts Card saved with state Draft. If you need active it now click Ok button')
                        })
                        if (confirmed) {
                            let activeCoupon = await this.rpc({
                                model: 'coupon.coupon',
                                method: 'write',
                                args: [coupon_ids, {
                                    state: 'new',
                                }],
                            })
                            var coupon_model = this.env.pos.models.find(m => m.model == 'coupon.coupon')
                            if (coupon_model) {
                                this.env.pos.load_server_data_by_model(coupon_model)
                            }
                            await this.env.pos.do_action('coupon.report_coupon_code', {
                                additional_context: {
                                    active_ids: [coupon_ids],
                                }
                            });
                            if (activeCoupon) {
                                this.showPopup('ConfirmPopup', {
                                    title: this.env._t('Finished'),
                                    body: this.env._t('Gift Card active and ready to use for Next Order now !!!'),
                                    disableCancelButton: true,
                                })
                            }
                            if (coupon_ids.length == 1 && this.env.pos.config.whatsapp_api && this.env.pos.config.whatsapp_token) {
                                let {confirmed, payload: mobile_no} = await this.showPopup('NumberPopup', {
                                    title: this.env._t('If you need to send Coupon to WhatsApp Number, please input WhatsApp Client Number bellow'),
                                    startingValue: default_mobile_no
                                })
                                if (confirmed) {
                                    let coupons = await this.rpc({
                                        model: 'coupon.coupon',
                                        method: 'search_read',
                                        domain: [['id', '=', coupon_ids[0]]],
                                        fields: []
                                    })
                                    const coupon = coupons[0]
                                    let message = this.env._t('Coupon Code: ') + coupon['code']
                                    if (coupon.origin) {
                                        message += this.env._t(', Origin: ') + coupon['origin']
                                    }
                                    if (coupon.expiration_date) {
                                        message += this.env._t(', Expiration Date: ') + coupon['expiration_date']
                                    }
                                    this.sendCouponPdfDirectWhatsApp(coupon, mobile_no, message)
                                }
                            }
                        }
                    }
                }
            }
        }

        async sendCouponPdfDirectWhatsApp(coupon, mobile_no, message) {
            let responseOfWhatsApp = await this.rpc({
                model: 'pos.config',
                method: 'send_pdf_via_whatsapp',
                args: [[], this.env.pos.config.id, coupon['code'], 'coupon.report_coupon_code', coupon.id, mobile_no, message],
            });
            if (responseOfWhatsApp && responseOfWhatsApp['id']) {
                return this.showPopup('ConfirmPopup', {
                    title: this.env._t('Successfully'),
                    body: this.env._t("Coupon send successfully to your Client's Phone WhatsApp: ") + mobile_no,
                    disableCancelButton: true,
                })
            } else {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t("Coupon sending is fail, please check WhatsApp API and Token of your pos config or Your Server turn off Internet"),
                    disableCancelButton: true,
                })
            }
        }


        async downloadCoupons(coupon_ids) {
            await this.env.pos.do_action('coupon.report_coupon_code', {
                additional_context: {
                    active_ids: [coupon_ids],
                }
            });
        }
    }

    ButtonPrintGiftCard.template = 'ButtonPrintGiftCard';

    ProductScreen.addControlButton({
        component: ButtonPrintGiftCard,
        condition: function () {
            return this.env.pos.couponGiftCardTemplate && this.env.pos.couponGiftCardTemplate.length > 0 && this.env.pos.config.coupon_giftcard_create;
        },
    });

    Registries.Component.add(ButtonPrintGiftCard);

    return ButtonPrintGiftCard;
});
