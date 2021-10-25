odoo.define('pos_retail.ClientInformation', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class ClientInformation extends PosComponent {
        constructor() {
            super(...arguments);
            this.currentOrder = this.props.currentOrder
        }

        async usePointsDoPayment() {
            var client = this.currentOrder.get_client();
            if (!client) {
                const {confirmed, payload: newClient} = await this.env.pos.chrome.showTempScreen(
                    'ClientListScreen',
                    {client: null}
                );
                if (confirmed) {
                    this.currentOrder.set_client(newClient);
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Required select customer for checking customer points')
                    })
                }

            }
            if (!this.env.pos.rewards) {
                return this.showPopup('ConfirmPopup', {
                    title: this.env._t('Error'),
                    body: this.env._t('Your POS not set any Loyalty Program'),
                    disableCancelButton: true
                })
            }
            const list = this.env.pos.rewards.map(reward => ({
                id: reward.id,
                label: reward.name,
                isSelected: false,
                item: reward
            }))
            let {confirmed, payload: reward} = await this.env.pos.chrome.showPopup('SelectionPopup', {
                title: this.env._t('Please select one Reward need apply to customer'),
                list: list,
            });
            if (confirmed) {
                this.currentOrder.setRewardProgram(reward)
            }
        }


        async useCreditsDoPayment() {
            let self = this;
            let amountDue = this.currentOrder.get_total_with_tax() + this.currentOrder.get_rounding_applied()
            let startingValue = 0;
            let clientCredit = this.currentOrder.get_client().balance
            let creditMethod = this.env.pos.payment_methods.find((p) => p.journal && p.pos_method_type == 'credit')
            if (!creditMethod) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your pos have not add Wallet Payment Method, please go to Journal create one Wallet journal with method type is wallet, and create one Payment Method type wallet link to this Journal Wallet')
                })
            }
            if (amountDue <= 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Due amount required bigger than 0')
                })
            }
            if (!this.currentOrder.get_client()) {
                const {confirmed, payload: newClient} = await this.showTempScreen(
                    'ClientListScreen',
                    {client: null}
                );
                if (confirmed) {
                    this.currentOrder.set_client(newClient);
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Alert'),
                        body: this.env._t('Required choice Customer')
                    })
                }
            }
            if (clientCredit >= amountDue) {
                startingValue = amountDue
            } else {
                startingValue = clientCredit
            }
            let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                title: this.env._t('Maximum Credit Customer can add :') + this.env.pos.format_currency(startingValue),
                startingValue: startingValue
            })
            if (confirmed) {
                if (number > clientCredit) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Credit amount just input required smaller than or equal credit points customer have: ') + clientCredit
                    })
                }
                if (number > amountDue) {
                    number = amountDue
                }
                let paymentLines = this.currentOrder.paymentlines.models
                paymentLines.forEach(function (p) {
                    if (p.payment_method && p.payment_method.journal && p.payment_method.pos_method_type == 'credit') {
                        self.currentOrder.remove_paymentline(p)
                    }
                })
                this.currentOrder.add_paymentline(creditMethod);
                let paymentline = this.currentOrder.selected_paymentline;
                paymentline.set_amount((parseFloat(number)));
                this.currentOrder.trigger('change', this.currentOrder);
            }

        }

        async useWalletsDoPayment() {
            let self = this;
            let amountDue = this.currentOrder.get_total_with_tax() + this.currentOrder.get_rounding_applied()
            let startingValue = 0;
            let clientWallet = this.currentOrder.get_client().wallet
            let walletMethod = this.env.pos.payment_methods.find((p) => p.journal && p.pos_method_type == 'wallet')
            if (!walletMethod) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your pos have not add Wallet Payment Method, please go to Journal create one Wallet journal with method type is wallet, and create one Payment Method type wallet link to this Journal Wallet')
                })
            }
            if (!this.currentOrder.get_client()) {
                const {confirmed, payload: newClient} = await this.showTempScreen(
                    'ClientListScreen',
                    {client: null}
                );
                if (confirmed) {
                    this.currentOrder.set_client(newClient);
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Alert'),
                        body: this.env._t('Required choice Customer')
                    })
                }
            }
            if (clientWallet >= amountDue) {
                startingValue = amountDue
            } else {
                startingValue = clientWallet
            }
            let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                title: this.env._t('Maximum Wallet Customer can add :') + this.env.pos.format_currency(startingValue),
                startingValue: startingValue
            })
            if (confirmed) {
                if (number > clientWallet) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Wallet amount just input required smaller than or equal wallet points customer have: ') + this.currentOrder.get_order().wallet
                    })
                }
                if (number > amountDue) {
                    number = amountDue
                }
                let paymentLines = this.currentOrder.paymentlines.models
                paymentLines.forEach(function (p) {
                    if (p.payment_method && p.payment_method.journal && p.payment_method.pos_method_type == 'wallet') {
                        self.currentOrder.remove_paymentline(p)
                    }
                })
                this.currentOrder.add_paymentline(walletMethod);
                let paymentline = this.currentOrder.selected_paymentline;
                paymentline.set_amount((parseFloat(number)));
                this.currentOrder.trigger('change', this.currentOrder);
            }

        }

        async showPurchasedHistories() {
            if (this.env.pos.get_order()) {
                const {confirmed, payload: result} = await this.showTempScreen(
                    'PosOrderScreen',
                    {
                        order: null,
                        selectedClient: this.env.pos.get_order().get_client()
                    }
                );
            } else {
                const {confirmed, payload: result} = await this.showTempScreen(
                    'PosOrderScreen',
                    {
                        order: null,
                        selectedClient: null
                    }
                );
            }
        }

    }

    ClientInformation.template = 'ClientInformation';

    Registries.Component.add(ClientInformation);

    return ClientInformation;
});
