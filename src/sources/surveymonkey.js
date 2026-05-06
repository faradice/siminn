const axios = require('axios');
const { fullLoad, incrementalLoad } = require('../db');

const BASE = process.env.SM_BASE_URL || 'https://api.eu.surveymonkey.com/v3';
const TOKEN = process.env.SM_TOKEN;
const SCHEMA = 'surveymonkey';

function api() {
  return axios.create({
    baseURL: BASE,
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
}

// Paginate through a SM API list endpoint
async function fetchAll(path) {
  const client = api();
  const items = [];
  let url = path;
  while (url) {
    const resp = await client.get(url);
    items.push(...(resp.data.data || []));
    url = resp.data.links?.next ? resp.data.links.next.replace(BASE, '') : null;
  }
  return items;
}

// Extract surveys list
async function extractSurveys() {
  console.log('  Fetching surveys...');
  const surveys = await fetchAll('/surveys');
  return surveys.map((s) => ({
    survey_id: s.id,
    title: s.title,
    nickname: s.nickname || null,
    href: s.href,
  }));
}

// Extract survey details (questions + pages)
async function extractQuestions(surveyId) {
  console.log(`  Fetching survey details for ${surveyId}...`);
  const client = api();
  const resp = await client.get(`/surveys/${surveyId}/details`);
  const survey = resp.data;
  const questions = [];

  for (const page of survey.pages || []) {
    for (const q of page.questions || []) {
      questions.push({
        survey_id: surveyId,
        question_id: q.id,
        page_id: page.id,
        heading: q.headings?.[0]?.heading || '',
        question_type: q.family,
        question_subtype: q.subtype || null,
        required: q.required?.text ? true : false,
        position: q.position,
      });
    }
  }
  return questions;
}

// Extract responses with all answers flattened into typed tables
async function extractResponses(surveyId) {
  console.log(`  Fetching responses for ${surveyId}...`);
  const client = api();

  // Get survey details for question type lookup + choice→value maps
  const detailResp = await client.get(`/surveys/${surveyId}/details`);
  const questionMap = {};
  for (const page of detailResp.data.pages || []) {
    for (const q of page.questions || []) {
      const choiceMap = {};
      const choices = q.answers?.choices || [];
      for (let i = 0; i < choices.length; i++) {
        choiceMap[choices[i].id] = { weight: choices[i].weight, index: i, text: choices[i].text };
      }
      const isNps = q.family === 'matrix' && q.subtype === 'rating' && choices.length >= 10;
      questionMap[q.id] = { family: q.family, subtype: q.subtype, isNps, choiceMap };
    }
  }

  // Fetch all responses (paginated, bulk endpoint)
  const responses = [];
  let url = `/surveys/${surveyId}/responses/bulk?per_page=100&status=completed`;
  while (url) {
    const resp = await client.get(url);
    responses.push(...(resp.data.data || []));
    url = resp.data.links?.next ? resp.data.links.next.replace(BASE, '') : null;
    if (responses.length % 200 === 0 && responses.length > 0) {
      console.log(`    ${responses.length} responses so far...`);
    }
  }

  // Flatten into typed answer tables
  const responseRows = [];
  const ratingRows = [];
  const multipleChoiceRows = [];
  const shortAnswerRows = [];
  const netPromoterRows = [];

  for (const r of responses) {
    responseRows.push({
      response_id: r.id,
      survey_id: surveyId,
      status: r.response_status,
      ip_address: r.ip_address || null,
      created_at: r.date_created,
      completed_at: r.date_modified,
      collector_id: r.collector_id,
    });

    for (const page of r.pages || []) {
      for (const q of page.questions || []) {
        const qType = questionMap[q.id] || {};

        for (const ans of q.answers || []) {
          if (qType.family === 'matrix' && qType.subtype === 'rating') {
            // Get numeric value from choice_metadata.weight or choiceMap
            const weight = parseInt(ans.choice_metadata?.weight);
            const choiceInfo = qType.choiceMap?.[ans.choice_id];
            const value = !isNaN(weight) ? weight : choiceInfo?.index ?? null;

            if (value != null) {
              if (qType.isNps) {
                // NPS: 0-10 scale (11+ choices)
                netPromoterRows.push({
                  response_id: r.id, survey_id: surveyId,
                  question_id: q.id, number: choiceInfo?.index ?? value,
                });
              } else {
                // Rating: 1-5 scale
                ratingRows.push({
                  response_id: r.id, survey_id: surveyId,
                  question_id: q.id, row_id: ans.row_id || null,
                  number: value,
                });
              }
            }
          } else if (qType.family === 'multiple_choice' || qType.family === 'single_choice') {
            const choiceInfo = qType.choiceMap?.[ans.choice_id];
            multipleChoiceRows.push({
              response_id: r.id, survey_id: surveyId,
              question_id: q.id, choice_id: ans.choice_id || null,
              choice_text: choiceInfo?.text || ans.text || null,
            });
          } else if (qType.family === 'open_ended' || qType.family === 'demographic') {
            if (ans.text) {
              shortAnswerRows.push({
                response_id: r.id, survey_id: surveyId,
                question_id: q.id, answer: ans.text,
              });
            }
          }
        }
      }
    }
  }

  return { responseRows, ratingRows, multipleChoiceRows, shortAnswerRows, netPromoterRows };
}

// Main: run full SurveyMonkey extract → local PostgreSQL
async function run() {
  if (!TOKEN) throw new Error('SM_TOKEN not set');

  console.log('\n━━━ SurveyMonkey Extract ━━━');

  // 1. Surveys
  const surveys = await extractSurveys();
  const surveyCount = await fullLoad(SCHEMA, 'survey', surveys);
  console.log(`  survey: ${surveyCount} rows`);

  // 2. Questions + Responses per survey
  let totalQuestions = 0;
  let totalResponses = 0;
  let totalRatings = 0;
  let totalMc = 0;
  let totalSa = 0;
  let totalNps = 0;

  const allQuestions = [];
  const allResponses = [];
  const allRatings = [];
  const allMc = [];
  const allSa = [];
  const allNps = [];

  for (const s of surveys) {
    const questions = await extractQuestions(s.survey_id);
    allQuestions.push(...questions);

    const answers = await extractResponses(s.survey_id);
    allResponses.push(...answers.responseRows);
    allRatings.push(...answers.ratingRows);
    allMc.push(...answers.multipleChoiceRows);
    allSa.push(...answers.shortAnswerRows);
    allNps.push(...answers.netPromoterRows);
  }

  // 3. Load all tables
  if (allQuestions.length) totalQuestions = await fullLoad(SCHEMA, 'question', allQuestions);
  if (allResponses.length) totalResponses = await fullLoad(SCHEMA, 'response', allResponses);
  if (allRatings.length) totalRatings = await fullLoad(SCHEMA, 'rating', allRatings);
  if (allMc.length) totalMc = await fullLoad(SCHEMA, 'multiple_choice', allMc);
  if (allSa.length) totalSa = await fullLoad(SCHEMA, 'short_answer', allSa);
  if (allNps.length) totalNps = await fullLoad(SCHEMA, 'net_promoter', allNps);

  const summary = {
    survey: surveyCount,
    question: totalQuestions,
    response: totalResponses,
    rating: totalRatings,
    multiple_choice: totalMc,
    short_answer: totalSa,
    net_promoter: totalNps,
  };

  console.log('\n  ── Summary ──');
  for (const [table, count] of Object.entries(summary)) {
    console.log(`  ${SCHEMA}.${table}: ${count} rows`);
  }

  return summary;
}

module.exports = { run };
