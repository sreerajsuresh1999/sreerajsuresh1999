odoo.define('pos_retail.SetPricelistButton', function (require) {
    'use strict';

    const SetPricelistButton = require('point_of_sale.SetPricelistButton');
    const Registries = require('point_of_sale.Registries');

    const RetailSetPricelistButton = (SetPricelistButton) =>
        class extends SetPricelistButton {
            async onClick() {
                const priceList = this.currentOrder.pricelist
                await super.onClick()
                const currentPricelist = this.currentOrder.pricelist
                if (priceList && currentPricelist && priceList['id'] != currentPricelist['id']) {
                    let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                        title: this.env._t('Make: ') + currentPricelist['name'],
                        body: this.env._t('to Default of Pricelist when add New Order ?')
                    })
                    if (confirmed) {
                        this.env.pos.default_pricelist = currentPricelist
                        await this.rpc({
                            model: 'pos.config',
                            method: 'write',
                            args: [[this.env.pos.config.id], {
                                pricelist_id: currentPricelist.id,
                            }],
                        })
                        this.env.pos.alert_message({
                            title: this.env._t('Successfully'),
                            body: currentPricelist['name'] + this.env._t(' Become to Default Pricelist of new Order')
                        })
                    }
                }


            }
        }
    Registries.Component.extend(SetPricelistButton, RetailSetPricelistButton);

    return RetailSetPricelistButton;
});
