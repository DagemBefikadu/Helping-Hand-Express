// Express docs: http://expressjs.com/en/api.html
const express = require('express')
// Passport docs: http://www.passportjs.org/docs/
const passport = require('passport')

// pull in Mongoose model for items
const Feedback = require('../models/feedback')

// this is a collection of methods that help us detect situations when we need
// to throw a custom error
const customErrors = require('../../lib/custom_errors')

// we'll use this function to send 404 when non-existant document is requested
const handle404 = customErrors.handle404
// we'll use this function to send 401 when a user tries to modify a resource
// that's owned by someone else
const requireOwnership = customErrors.requireOwnership

// this is middleware that will remove blank fields from `req.body`, e.g.
// { item: { title: '', text: 'foo' } } -> { item: { text: 'foo' } }
const removeBlanks = require('../../lib/remove_blank_fields')
// passing this as a second argument to `router.<verb>` will make it
// so that a token MUST be passed for that route to be available
// it will also set `req.user`
const requireToken = passport.authenticate('bearer', { session: false })

// instantiate a router (mini app that only handles routes)
const router = express.Router()

// INDEX for all feedbacks
// GET /feedbacks
router.get('/feedbacks', (req, res, next) => {
	Feedback.find()
		.populate('owner')
		.then((feedbacks) => {
			// `feedbacks` will be an array of Mongoose documents
			// we want to convert each one to a POJO, so we use `.map` to
			// apply `.toObject` to each one
			return feedbacks.map((feedback) => feedback.toObject())
		})
		// respond with status 200 and JSON of the items
		.then((feedbacks) => res.status(200).json({ feedbacks: feedbacks }))
		// if an error occurs, pass it to the handler
		.catch(next)
})

// SHOW ONE Feedback entry
// GET /items/5a7db6c74d55bc51bdf39793
router.get('/feedbacks/:id', (req, res, next) => {
	// req.params.id will be set based on the `:id` in the route
	Feedback.findById(req.params.id)
		.then(handle404)
		// if `findById` is succesful, respond with 200 and "feedback" JSON
		.then((feedback) => res.status(200).json({ feedback: feedback.toObject() }))
		// if an error occurs, pass it to the handler
		.catch(next)
})

// CREATE
// POST /feedbacks
router.post('/feedbacks', requireToken, (req, res, next) => {
	// set owner of new the new feedback entry to be current user
	req.body.feedback.owner = req.user.id
	Feedback.create(req.body.feedback)
		// respond to succesful `create` with status 201 and JSON of new "feedback" entry
		.then((item) => {
			res.status(201).json({ item: item.toObject() })
		})
		// if an error occurs, pass it off to our error handler
		// the error handler needs the error message and the `res` object so that it
		// can send an error message back to the client
		.catch(next)
})

// UPDATE
// PATCH /feedbacks/5a7db6c74d55bc51bdf39793
router.patch('/feedbacks/:id', requireToken, removeBlanks, (req, res, next) => {
	// if the client attempts to change the `owner` property by including a new
	// owner, prevent that by deleting that key/value pair
	delete req.body.feedback.owner

	Feedback.findById(req.params.id)
		.then(handle404)
		.then((feedback) => {
			// pass the `req` object and the Mongoose record to `requireOwnership`
			// it will throw an error if the current user isn't the owner
			requireOwnership(req, feedback)

			// pass the result of Mongoose's `.update` to the next `.then`
			return Feedback.updateOne(req.body.feedback)
		})
		// if that succeeded, return 204 and no JSON
		.then(() => res.sendStatus(204))
		// if an error occurs, pass it to the handler
		.catch(next)
})

// DESTROY
// DELETE /feedbacks/5a7db6c74d55bc51bdf39793
router.delete('/feedbacks/:id', requireToken, (req, res, next) => {
	Feedback.findById(req.params.id)
		.then(handle404)
		.then((feedback) => {
			// throw an error if current user doesn't own this `feedback`
			requireOwnership(req, feedback)
			// delete the feedback ONLY IF the above didn't throw an error
			feedback.deleteOne()
		})
		// send back 204 and no content if the deletion succeeded
		.then(() => res.sendStatus(204))
		// if an error occurs, pass it to the handler
		.catch(next)
})

module.exports = router