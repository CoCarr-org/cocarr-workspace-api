const { v4: uuidv4 } = require('uuid');
const { CustomError } = require('../middlewares/error');
const { JobOffer } = require('../models');
const recruitment = require('./recruitmentService');
const storage = require('../helper/objectStorage');

// Job-offer lifecycle: draft → sent → accepted | rejected (or withdrawn/expired).
//
// The accept/reject RULES live here in respond(), on purpose: today the only
// caller is HR recording the candidate's answer, but the planned candidate portal
// (careers login + emailed offer link) will call the SAME function with
// channel:'candidate_portal'. Keeping the transition in one place is what makes
// that a new caller rather than a second, drifting copy of the logic.

const CREATE_FIELDS = ['jobPostingId', 'designationId', 'designationTitle',
  'ctcAmount', 'ctcCurrency', 'expectedJoiningDate', 'notes'];
const pick = (body, fields) => {
  const out = {};
  fields.forEach((f) => { if (body[f] !== undefined) out[f] = body[f]; });
  return out;
};

async function getById(offerId) {
  const offer = await JobOffer.findByPk(offerId);
  if (!offer) throw new CustomError('Offer not found', 404, 'NOT_FOUND');
  return offer;
}

// Create a draft offer for a candidate. An optional `letter` data URI is stored
// privately and its key attached. Creating an offer moves the candidate to the
// `offer` stage's antechamber — `selected` — if they are behind it; sending is
// what puts them at `offer`.
async function create(candidateId, body, actor = {}) {
  const candidate = await recruitment.getById(candidateId);
  const data = pick(body, CREATE_FIELDS);
  if (body.letter) data.letterKey = (await storage.putOfferLetter(body.letter)).key;
  const offer = await JobOffer.create({ ...data, candidateId, status: 'draft' });
  if (['applied', 'screening', 'shortlisted', 'interview'].includes(candidate.stage)) {
    await recruitment.recordStage(candidate, 'selected', { byUserId: actor.byUserId, note: 'Offer drafted' });
  }
  return offer;
}

async function update(offerId, body) {
  const offer = await getById(offerId);
  if (offer.status !== 'draft') {
    throw new CustomError('Only a draft offer can be edited', 409, 'CONFLICT');
  }
  const data = pick(body, CREATE_FIELDS);
  if (body.letter) data.letterKey = (await storage.putOfferLetter(body.letter)).key;
  await offer.update(data);
  return offer;
}

// Send the offer to the candidate. Mints a response token now even though HR
// records the answer today — the token is exactly what a future emailed
// Accept/Reject link would carry, so the self-serve flow adds a page, not a
// schema change. Moves the candidate to the `offer` stage.
async function send(offerId, actor = {}) {
  const offer = await getById(offerId);
  if (!['draft', 'sent'].includes(offer.status)) {
    throw new CustomError(`An offer that is ${offer.status} cannot be sent`, 409, 'CONFLICT');
  }
  await offer.update({
    status: 'sent',
    sentAt: new Date(),
    responseToken: offer.responseToken || uuidv4(),
  });
  const candidate = await recruitment.getById(offer.candidateId);
  await recruitment.recordStage(candidate, 'offer', { byUserId: actor.byUserId, note: 'Offer sent' });
  return offer;
}

// Record the candidate's decision. `channel` distinguishes HR-recorded from a
// future candidate-portal response; `by` is whoever answered (an HR principal
// now, the candidate later). Accepting converts them to an onboarding employee
// carrying the offer's expected joining date; rejecting exits the pipeline.
async function respond(offerId, { decision, note = null, channel = 'hr_recorded', by = null } = {}) {
  if (!['accepted', 'rejected'].includes(decision)) {
    throw new CustomError('decision must be accepted or rejected', 400, 'VALIDATION_ERROR');
  }
  const offer = await getById(offerId);
  if (offer.status !== 'sent') {
    throw new CustomError(`Only a sent offer can be responded to (this one is ${offer.status})`, 409, 'CONFLICT');
  }
  await offer.update({
    status: decision,
    respondedAt: new Date(),
    respondedBy: by,
    responseChannel: channel,
    responseNote: note,
  });

  if (decision === 'accepted') {
    // Converts the candidate to an onboarding employee with the joining date.
    const employee = await recruitment.hire(offer.candidateId, {
      dateOfJoining: offer.expectedJoiningDate || null,
      byUserId: by,
    });
    return { offer, employee };
  }
  const candidate = await recruitment.getById(offer.candidateId);
  await recruitment.recordStage(candidate, 'rejected', { byUserId: by, note: note || 'Offer declined' });
  return { offer };
}

async function withdraw(offerId, actor = {}) {
  const offer = await getById(offerId);
  if (!['draft', 'sent'].includes(offer.status)) {
    throw new CustomError(`An offer that is ${offer.status} cannot be withdrawn`, 409, 'CONFLICT');
  }
  await offer.update({ status: 'withdrawn', respondedBy: actor.byUserId, respondedAt: new Date() });
  return offer;
}

async function attachLetter(offerId, letter) {
  const offer = await getById(offerId);
  const { key } = await storage.putOfferLetter(letter);
  await offer.update({ letterKey: key });
  return offer;
}

async function letterStream(offerId) {
  const offer = await getById(offerId);
  if (!offer.letterKey) throw new CustomError('This offer has no letter attached', 404, 'NOT_FOUND');
  const object = await storage.getOfferLetter(offer.letterKey);
  return { object, offer };
}

module.exports = {
  getById, create, update, send, respond, withdraw, attachLetter, letterStream,
};
