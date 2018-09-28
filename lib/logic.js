/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';
/**
 * Write your transction processor functions here
 */

/**
 * Sample transaction
 * @param {marketplace.Trade} Trade
 * @transaction
 */
async function Trade(trade) {
    let index;
    let buyer_account;
    let seller_account;
    for (index = 0; index < trade.bank.accounts.length; index++) {
        if (trade.bank.accounts[index].owner === trade.buyer) {
            buyer_account = trade.bank.accounts[index]
        }
        else if (trade.bank.accounts[index].owner === trade.seller) {
            seller_account = trade.bank.accounts[index]
        }
    }
    if(buyer_account.balance < trade.product.price) {
        throw new Error('Buyer has insufficient funds!');
    }

    buyer_account.balance -= trade.product.price;
    seller_account.balance += trade.product.price;
    trade.product.owner = trade.buyer;

    const productAssetRegistry = await getAssetRegistry('marketplace.Product');
    await productAssetRegistry.update(trade.product);

    const bankAccountAssetRegistry = await getAssetRegistry('marketplace.BankAccount');
    await bankAccountAssetRegistry.update(buyer_account)
    await bankAccountAssetRegistry.update(seller_account)

    // TODO: 1. push new product to boughtProducts list of buyer
    // TODO: 2. push product to soldProducts list of seller
    // Get the asset registry for the asset.
    const sellerRegistry = await getParticipantRegistry('marketplace.Seller');
    await sellerRegistry.update(trade.seller)
    const buyerRegistry = await getParticipantRegistry('marketplace.Buyer');
    await buyerRegistry.update(trade.buyer)
}
