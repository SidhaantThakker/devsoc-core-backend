'use strict';
const { sanitizeEntity } = require('strapi-utils');
const stripe = require('stripe')(process.env.STRIPE_SK)

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-controllers)
 * to customize this controller
 */

module.exports = {

    async find(ctx){
        const { user } = ctx.state
        let entities
        if(ctx.query._q) {
            entities = await strapi.services.order.search({...ctx.query, user: user.id})
        } else {
            entities = await strapi.services.order.find({...ctx.query, user: user.id})
        }

        return entities.map(entity => sanitizeEntity(entity, {model: strapi.models.order}))
    },
    async findOne(ctx){
        const { id } = ctx.params
        const { user } = ctx.state
        const entity = await strapi.services.order.findOne({ id, user: user.id})
        return sanitizeEntity(entity, { model: strapi.models.order })
    },

    async create(ctx){
        const { dish } = ctx.request.body

        console.log(dish)

        if(!dish){
            return ctx.throw(400, 'No dish chosen')
        }

        const realDish = await strapi.services.dish.findOne({
            id: dish.id
        })

        if(!realDish) {
            return ctx.throw(404, 'No dish with given ID')
        }

        const { user } = ctx.state

        const BASE_URL = ctx.request.headers.origin || 'https://localhost:3000'

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: user.email,
            mode: 'payment',
            success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: BASE_URL,
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: realDish.name
                        },
                        unit_amount: parseInt(realDish.price*100),
                    },
                    quantity: 1
                }
            ]
        })

        const newOrder = await strapi.services.order.create({
            user: user.id,
            dish: realDish.id,
            total: realDish.price,
            status: 'unpaid',
            checkout_session: session.id
        })

        return {id: session.id}

    },

    async confirm(ctx){
        const { checkout_session } = ctx.request.body
        const session = await stripe.checkout.sessions.retrieve(checkout_session)
        if(session.payment_status === 'paid'){
            const updateOrder = await strapi.services.order.update({
                checkout_session
            }, {
                status: 'paid'
            })

            return sanitizeEntity(updateOrder, {model: strapi.models.order})
        } else {
            ctx.throw(400, 'Error during final payment, contact the administrator')
        }
    }
};
