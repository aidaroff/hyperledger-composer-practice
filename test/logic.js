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
 * Write the unit tests for your transction processor functions here
 */

const AdminConnection = require('composer-admin').AdminConnection;
const BusinessNetworkConnection = require('composer-client').BusinessNetworkConnection;
const { BusinessNetworkDefinition, CertificateUtil, IdCard } = require('composer-common');
const path = require('path');

const chai = require('chai');
chai.should();
chai.use(require('chai-as-promised'));

const namespace = 'marketplace';

// participants
const BUYER = 'Buyer';
const SELLER = 'Seller';
const BANK = 'Bank';

// assets
const PRODUCT = 'Product';
const BANKACCOUNT = 'BankAccount';

//transactions
const TRADE = 'Trade';

const assets = {
    'Product': namespace + '.' + PRODUCT,
    'BankAccount': namespace + '.' + BANKACCOUNT,
};
const participants = {
    'Buyer': namespace + '.' + BUYER,
    'Seller': namespace + '.' + SELLER,
    'Bank': namespace + '.' + BANK
};

describe('#' + namespace, () => {
    // In-memory card store for testing so cards are not persisted to the file system
    const cardStore = require('composer-common').NetworkCardStoreManager.getCardStore( { type: 'composer-wallet-inmemory' } );

    // Embedded connection used for local testing
    const connectionProfile = {
        name: 'embedded',
        'x-type': 'embedded'
    };

    // Name of the business network card containing the administrative identity for the business network
    const adminCardName = 'admin';

    // Admin connection to the blockchain, used to deploy the business network
    let adminConnection;

    // This is the business network connection the tests will use.
    let businessNetworkConnection;

    // This is the factory for creating instances of types.
    let factory;

    // These are the identities for Alice and Bob.
    const aliceCardName = 'alice';
    const bobCardName = 'bob';

    // These are a list of receieved events.
    let events;

    let businessNetworkName;

    before(async () => {
        // Generate certificates for use with the embedded connection
        const credentials = CertificateUtil.generate({ commonName: 'admin' });

        // Identity used with the admin connection to deploy business networks
        const deployerMetadata = {
            version: 1,
            userName: 'PeerAdmin',
            roles: [ 'PeerAdmin', 'ChannelAdmin' ]
        };
        const deployerCard = new IdCard(deployerMetadata, connectionProfile);
        deployerCard.setCredentials(credentials);
        const deployerCardName = 'PeerAdmin';

        adminConnection = new AdminConnection({ cardStore: cardStore });

        await adminConnection.importCard(deployerCardName, deployerCard);
        await adminConnection.connect(deployerCardName);
    });

    /**
     *
     * @param {String} cardName The card name to use for this identity
     * @param {Object} identity The identity details
     */
    async function importCardForIdentity(cardName, identity) {
        const metadata = {
            userName: identity.userID,
            version: 1,
            enrollmentSecret: identity.userSecret,
            businessNetwork: businessNetworkName
        };
        const card = new IdCard(metadata, connectionProfile);
        await adminConnection.importCard(cardName, card);
    }

    // This is called before each test is executed.
    beforeEach(async () => {
        // Generate a business network definition from the project directory.
        let businessNetworkDefinition = await BusinessNetworkDefinition.fromDirectory(path.resolve(__dirname, '..'));
        businessNetworkName = businessNetworkDefinition.getName();
        await adminConnection.install(businessNetworkDefinition);
        const startOptions = {
            networkAdmins: [
                {
                    userName: 'admin',
                    enrollmentSecret: 'adminpw'
                }
            ]
        };
        const adminCards = await adminConnection.start(businessNetworkName, businessNetworkDefinition.getVersion(), startOptions);
        await adminConnection.importCard(adminCardName, adminCards.get('admin'));

        // Create and establish a business network connection
        businessNetworkConnection = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        businessNetworkConnection.on('event', event => {
            events.push(event);
        });
        await businessNetworkConnection.connect(adminCardName);

        // Get the factory for the business network.
        factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        // Create the participants.
        const alice = factory.newResource(namespace, BUYER, 'alice');
        alice.firstName = 'Alice';
        alice.lastName = 'A';
        alice.personId = 'alice';
        alice.boughtProducts = [];

        const bob = factory.newResource(namespace, SELLER, 'bob');
        bob.firstName = 'Bob';
        bob.lastName = 'B';
        bob.personId = 'bob';
        bob.soldProducts = [];
        bob.listedProducts = [];

        // PRODUCT ASSET
        const product1 = factory.newResource(namespace, PRODUCT, 'product1');
        product1.owner = factory.newRelationship(namespace, SELLER, 'bob');
        product1.seller = factory.newRelationship(namespace, SELLER, 'bob');
        product1.status = 'listed';
        product1.productName = 'product 1 name';
        product1.productId = 'product1';
        product1.price = 500;

        const productRegistry = await businessNetworkConnection.getAssetRegistry(assets[PRODUCT]);
        productRegistry.add(product1);

        // PARTICIPANT: BANK
        const bank = factory.newResource(namespace, BANK, 'bank');
        bank.name = 'bank';
        bank.accounts = [];

        const bankRegistry = await businessNetworkConnection.getParticipantRegistry(participants[BANK]);
        bankRegistry.add(bank);

        // BANKACCOUNT ASSSET
        const aliceBankAccount = factory.newResource(namespace, BANKACCOUNT, 'alice_account');
        aliceBankAccount.owner = factory.newRelationship(namespace, BUYER, 'alice');
        aliceBankAccount.balance = 1000;
        aliceBankAccount.accountId = 'alice_account';
        aliceBankAccount.bank = factory.newRelationship(namespace, BANK, 'bank');

        const bobBankAccount = factory.newResource(namespace, BANKACCOUNT, 'bob_account');
        bobBankAccount.owner = factory.newRelationship(namespace, BUYER, 'bob');
        bobBankAccount.balance = 0;
        bobBankAccount.accountId = 'bob_account';
        bobBankAccount.bank = factory.newRelationship(namespace, BANK, 'bank');

        const bankAccountRegistry = await businessNetworkConnection.getAssetRegistry(assets[BANKACCOUNT]);
        await bankAccountRegistry.addAll([aliceBankAccount, bobBankAccount]);

        bank.accounts = [factory.newRelationship(namespace, BANKACCOUNT, 'alice_account'), factory.newRelationship(namespace, BANKACCOUNT, 'bob_account')];
        await bankRegistry.update(bank);

        const buyerRegistry = await businessNetworkConnection.getParticipantRegistry(participants[BUYER]);
        buyerRegistry.add(alice);

        const sellerRegistry = await businessNetworkConnection.getParticipantRegistry(participants[SELLER]);
        sellerRegistry.add(bob);
    });

    /**
     * Reconnect using a different identity.
     * @param {String} cardName The name of the card for the identity to use
     */
    async function useIdentity(cardName) {
        await businessNetworkConnection.disconnect();
        businessNetworkConnection = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        businessNetworkConnection.on('event', (event) => {
            events.push(event);
        });
        await businessNetworkConnection.connect(cardName);
        factory = businessNetworkConnection.getBusinessNetwork().getFactory();
    }

    it('Seller can read listed products', async () => {
        const productRegistry = await businessNetworkConnection.getAssetRegistry(assets[PRODUCT]);
        const products = await productRegistry.getAll();
        // Validate the assets.
        products.should.have.lengthOf(1);
        const product1 = products[0];
        product1.owner.getFullyQualifiedIdentifier().should.equal(participants[SELLER] + '#bob');
        product1.price.should.equal(500);
    });

    it('Seller can list products', async () => {
        // Create the asset.
        let product2 = factory.newResource(namespace, PRODUCT, 'product2');
        product2.owner = factory.newRelationship(namespace, SELLER, 'bob');
        product2.seller = factory.newRelationship(namespace, SELLER, 'bob');
        product2.price = 400;
        product2.productName = 'product 2 name';
        product2.status = 'listed';

        // Add the asset, then get the asset.
        const productRegistry = await businessNetworkConnection.getAssetRegistry(assets[PRODUCT]);
        await productRegistry.add(product2);

        // Validate the asset.
        product2 = await productRegistry.get('product2');
        product2.owner.getFullyQualifiedIdentifier().should.equal(participants[SELLER] + '#bob');
        product2.price.should.equal(400);
    });

    it('participants should be able to trade products', async () => {
        const bankRegistry = await businessNetworkConnection.getParticipantRegistry(participants[BANK]);
        const bank = await bankRegistry.get('bank');

        //TRANSACTION
        const trade1 = factory.newTransaction(namespace, TRADE);
        trade1.product = factory.newRelationship(namespace, PRODUCT, 'product1');
        trade1.buyer = factory.newRelationship(namespace, BUYER, 'alice');
        trade1.seller = factory.newRelationship(namespace, SELLER, 'bob');
        trade1.bank = factory.newRelationship(namespace, BANK, 'bank');

        //SUBMIT TRANSACTION
        await businessNetworkConnection.submitTransaction(trade1);

        //GET ASSETS AND PARTICIPANTS
        const productRegistry = await businessNetworkConnection.getAssetRegistry(assets[PRODUCT]);
        const product1 = await productRegistry.get('product1');

        // const buyerRegistry = await businessNetworkConnection.getParticipantRegistry(participants[BUYER]);
        // QUESTION: alice does not exist! why?
        // const alice = await buyerRegistry.get('alice');
        // console.log('alice222:', alice);
        // const sellerRegistry = await businessNetworkConnection.getParticipantRegistry(participants[SELLER]);
        // const bob = sellerRegistry.get('bob');
        product1.owner.$identifier.should.deep.equal('alice');
    });


});
