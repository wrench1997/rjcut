import {
  decoratePersonsForGeneration,
  dedupePersonsForDisplay,
  findMatchingPerson,
  isCustomTrainingPerson,
  personSelectionKey,
  resolvePersonIdentity,
  verifyGeneratedPersonIdentity,
} from '../src/features/digital-human-project/personIdentity.js'
import { createTimelineDigitalHumanTask } from '../src/features/digital-human-project/digitalHumanApi.js'

const persons = decoratePersonsForGeneration([
  {
    id: 'dp_human',
    person_id: 'dp_human',
    name: 'Mona_Lisa_by_Leonardo_da_Vinci',
    cover_url: '/v1/dh/proxy-image?path=%2Froot%2FMuseTalk%2Fdata%2Fvideo%2FMona_Lisa_by_Leonardo_da_Vinci.png',
    preview_video_url: '/root/MuseTalk/data/video/Mona_Lisa_by_Leonardo_da_Vinci.mp4',
  },
  {
    id: 'dp_human',
    person_id: 'dp_human',
    name: 'other_woman',
    cover_url: '/v1/dh/proxy-image?path=%2Froot%2FMuseTalk%2Fdata%2Fvideo%2Fother_woman.png',
    preview_video_url: '/root/MuseTalk/data/video/other_woman.mp4',
  },
], 'common')

if (persons[0].generation_person_id !== 'Mona_Lisa_by_Leonardo_da_Vinci') {
  throw new Error(`Mona Lisa generation id mismatch: ${persons[0].generation_person_id}`)
}
if (persons[1].generation_person_id !== 'other_woman') {
  throw new Error(`other generation id mismatch: ${persons[1].generation_person_id}`)
}
if (personSelectionKey(persons[0]) === personSelectionKey(persons[1])) {
  throw new Error('duplicate legacy id produced the same selection key')
}
if (persons.some((person) => person.identityConflict)) {
  throw new Error('distinct preview files must not be marked as identity conflicts')
}

const duplicateCustomPersons = dedupePersonsForDisplay(decoratePersonsForGeneration([
  { id: 'dp_custom_810', name: '鹿茸血_810', cover_url: '/files/custom/810.png' },
  { id: 'dp_custom_810', name: '鹿茸血_810', cover_url: '/files/custom/810.png' },
], 'custom'), 'custom')
if (duplicateCustomPersons.length !== 1) {
  throw new Error(`duplicate custom persons were not collapsed: ${duplicateCustomPersons.length}`)
}

const duplicatedAcrossCommonAndCustom = dedupePersonsForDisplay([
  ...decoratePersonsForGeneration([{
    id: 'custom_966ed1ce',
    name: '812',
    figures: [{ cover: '/files/api_tasks/training/custom_966ed1ce/cover.png' }],
  }], 'common'),
  ...decoratePersonsForGeneration([{
    id: 'custom_966ed1ce',
    name: '812',
    cover_url: 'merchant/covers/4fc1b7e4eff0.jpg',
  }], 'custom'),
], 'all')
if (duplicatedAcrossCommonAndCustom.length !== 1) {
  throw new Error(`same custom model from common/private lists was not collapsed: ${duplicatedAcrossCommonAndCustom.length}`)
}
if (duplicatedAcrossCommonAndCustom[0].type !== 'custom') {
  throw new Error('private custom-person record should win when the same model appears in both lists')
}

if (!isCustomTrainingPerson({ id: 'dp_custom_966ed1ce' })) {
  throw new Error('dp_custom_* record was not recognized as a private training asset')
}
if (!isCustomTrainingPerson({
  id: 'dp_human',
  figures: [{ cover: '/files/api_tasks/training/custom_966ed1ce/cover.png' }],
})) {
  throw new Error('training-path record was not recognized as a private training asset')
}
if (isCustomTrainingPerson({ id: 'dp_human', name: '平台数字人' })) {
  throw new Error('platform person was incorrectly classified as custom')
}

const publicPersonsWithSharedLegacyId = dedupePersonsForDisplay(persons, 'common')
if (publicPersonsWithSharedLegacyId.length !== 2) {
  throw new Error('public persons with a shared legacy id were incorrectly collapsed')
}

const matched = findMatchingPerson(persons, {
  generation_person_id: 'Mona_Lisa_by_Leonardo_da_Vinci',
  name: 'Mona_Lisa_by_Leonardo_da_Vinci',
})
if (matched !== persons[0]) throw new Error('preselected Mona Lisa matched the wrong card')

const fallbackIdentity = resolvePersonIdentity({ id: 'dp_human', type: 'common' })
if (fallbackIdentity.generationPersonId !== 'human') {
  throw new Error(`legacy dp_ prefix was not normalized: ${fallbackIdentity.generationPersonId}`)
}

const verified = verifyGeneratedPersonIdentity(
  { resolved_person_id: 'Mona_Lisa_by_Leonardo_da_Vinci' },
  'Mona_Lisa_by_Leonardo_da_Vinci'
)
if (!verified.verified) throw new Error('matching result identity was not verified')

let mismatchRejected = false
try {
  verifyGeneratedPersonIdentity(
    { resolved_person_id: 'other_woman' },
    'Mona_Lisa_by_Leonardo_da_Vinci'
  )
} catch (error) {
  mismatchRejected = /数字人不匹配/u.test(error.message)
}
if (!mismatchRejected) throw new Error('resolved person mismatch was not rejected')

let fetchPayload = null
globalThis.fetch = async (_url, options) => {
  fetchPayload = JSON.parse(options.body)
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ ok: true, task_id: 'test_task', status: 'queued' }),
  }
}

let missingIdRejected = false
try {
  await createTimelineDigitalHumanTask({ text: '测试' }, 'http://127.0.0.1:8080')
} catch (error) {
  missingIdRejected = /缺少 person_id/u.test(error.message)
}
if (!missingIdRejected) throw new Error('missing person_id silently fell back to human')

await createTimelineDigitalHumanTask({
  text: '测试蒙娜丽莎。',
  person_id: persons[0].generation_person_id,
}, 'http://127.0.0.1:8080')

if (fetchPayload?.person_id !== 'Mona_Lisa_by_Leonardo_da_Vinci') {
  throw new Error(`request sent wrong person_id: ${fetchPayload?.person_id}`)
}

console.log('DIGITAL_HUMAN_PERSON_IDENTITY=PASS')
