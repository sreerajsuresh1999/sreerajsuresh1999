odoo.define('pos_retail.giftCardRedeemPopup', function(require) {
    'use strict';

    const { useState, useRef } = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    var rpc = require('web.rpc');
    var core = require('web.core');
    var _t = core._t;

    class giftCardRedeemPopup extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.state = useState({ GiftCardNumber: '', GiftCardAmount:'', showCardNumberInput: true});
            this.gift_card_number_ref = useRef('gift_card_number');
            this.gift_card_amount_ref = useRef('gift_card_amount');
            this.redeem = false;
        }
        mounted() {
            this._autoFillData();
            this.gift_card_number_ref.el.focus();
        }
        getPayload() {
            return {
                card_no: this.state.GiftCardNumber,
                card_amount: Number(this.state.GiftCardAmount),
                redeem: this.redeem,
            };
        }
        CheckGiftCardBalance(e) {
            self = this;
            if (e.which == 13 && this.state.GiftCardNumber) {
                var today = moment().locale('en').format('YYYY-MM-DD');
                var code = this.state.GiftCardNumber;
                var get_redeems = this.env.pos.get_order().get_redeem_giftcard();
                var existing_card = _.where(get_redeems, {'redeem_card': code });
                var params = {
                    model: 'pos.gift.card',
                    method: 'search_read',
                    domain: [['card_no', '=', code], ['expire_date', '>=', today],['issue_date', '<=', today]],
                }
                rpc.query(params, {async: false}).then(function(res){
                    if(res.length > 0){
                        if (res[0]){
                            if(existing_card.length > 0){
                                res[0]['card_value'] = existing_card[existing_card.length - 1]['redeem_remaining']
                            }
                            self.redeem = res[0];
                            $('#lbl_card_no').html("Your Balance is  "+ self.env.pos.format_currency(res[0].card_value));
                            if(res[0].customer_id[1]){
                                $('#lbl_set_customer').html("Hello  "+ res[0].customer_id[1]);
                            } else{
                                $('#lbl_set_customer').html("Hello  ");
                            }
                            $('#text_redeem_amount').show();
                            if(res[0].card_value <= 0){
                                $('#redeem_amount_row').hide();
                                $('#in_balance').show();
                            }else{
                                $('#redeem_amount_row').fadeIn('fast');
                                $('#text_redeem_amount').focus();
                            }
                        }
                    }else{
                        this.env.pos.chrome.showNotification(this.env._t('Warning'), _t('Barcode not found or Gift Card has been Expired.'))
                        $('#text_gift_card_no').focus();
                        $('#lbl_card_no').html('');
                        $('#lbl_set_customer').html('');
                        $('#in_balance').html('');
                        $('#text_redeem_amount').hide();
                    }
                });
            }
        }
        cancel() {
            this.trigger('close-popup');
        }
        _autoFillData(){
            var self = this;
            var today = moment().locale('en').format('YYYY-MM-DD');
            var customer_id = this.env.pos.get_order().get_client().id;
            var get_redeems = this.env.pos.get_order().get_redeem_giftcard();
            var QtyGetPromise = new Promise(function(resolve, reject){
                rpc.query({
                model: 'pos.gift.card',
                method: 'search_read',
                domain: [['customer_id', '=', customer_id], ['expire_date', '>=', today],['issue_date', '<=', today]],
                }).then(function(res){
                    if(res.length == 1){
                        if (res[0]){
                            resolve(res[0]);
                        }
                        else{
                            reject()
                        }
                    }
                });
            });
            QtyGetPromise.then(function(result){
                self.state.GiftCardNumber = result.card_no;
                self.state.GiftCardAmount = (result.card_value >= self.env.pos.get_order().get_due()) ? self.env.pos.get_order().get_due() : result.card_value
                self.state.showCardNumberInput = false;
                self.redeem = result;
                if(result.customer_id[1]){
                    $('#lbl_set_customer').html("Hello  "+ result.customer_id[1]);
                }else {
                    $('#lbl_set_customer').html("Hello");
                }
                $('#lbl_single_card_no').html("Your Card No. is " + result.card_no);
                $('#lbl_card_no').html("Your Balance is  "+ self.env.pos.format_currency(result.card_value));
                $('#text_redeem_amount').show();
                if(result.card_value <= 0){
                    $('#redeem_amount_row').hide();
                    $('#in_balance').show();
                }else{
                    $('#redeem_amount_row').fadeIn('fast');
                    $('#text_redeem_amount').focus();
                }
            });
        }
    }

    giftCardRedeemPopup.template = 'giftCardRedeemPopup';
    giftCardRedeemPopup.defaultProps = {
        confirmText: 'Apply',
        cancelText: 'Cancel',
        title: '',
        body: '',
    };

    Registries.Component.add(giftCardRedeemPopup);

    return giftCardRedeemPopup;
});
