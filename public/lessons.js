/* Lessons for Discover: short passages from Greek and Roman philosophers.
 *
 * Every quotation is from a public-domain English translation, credited on
 * the card, and quoted word for word. Don't paraphrase a passage and keep the
 * quotation marks: if a line can't be checked against the named translation,
 * it doesn't go in. The meaning, question and exercise are Sona's own words.
 *
 * Translations used:
 *   Epictetus, Enchiridion: Elizabeth Carter (1758) and George Long (1888)
 *   Marcus Aurelius, Meditations: George Long (1862)
 *   Seneca, Moral Letters to Lucilius: Richard M. Gummere (1917)
 *   Plato (Apology, Cratylus): Benjamin Jowett (1871)
 *   Aristotle, Nicomachean Ethics: W. D. Ross (1908)
 */
(function (root) {
  'use strict';

  var THINKERS = {
    epictetus: { name: 'Epictetus', life: 'c. 50–135 AD', note: 'Born a slave, taught in Nicopolis' },
    marcus: { name: 'Marcus Aurelius', life: '121–180 AD', note: 'Roman emperor, wrote for himself' },
    seneca: { name: 'Seneca', life: 'c. 4 BC–65 AD', note: 'Statesman and letter writer' },
    socrates: { name: 'Socrates', life: 'c. 470–399 BC', note: 'Known through Plato' },
    aristotle: { name: 'Aristotle', life: '384–322 BC', note: 'Student of Plato, teacher of Alexander' },
    heraclitus: { name: 'Heraclitus', life: 'c. 535–475 BC', note: 'Known through fragments' },
  };

  var TOPICS = {
    control: 'What you control',
    mind: 'Your judgements',
    time: 'Time',
    others: 'Other people',
    habit: 'Habits',
    learning: 'Learning',
    change: 'Change',
  };

  var LESSONS = [
    {
      id: 'l-ench-1', who: 'epictetus', topic: 'control',
      text: 'Of things some are in our power, and others are not.',
      source: 'Enchiridion, 1', tr: 'George Long',
      meaning: 'The opening line of Epictetus’ handbook splits everything in two: what you can steer (your effort, your choices, how you respond) and what you can’t (other people, results, luck). Most worry comes from mixing the two up.',
      ask: 'What are you worried about right now that sits in the second group?',
      try: 'Before your next exam or deadline, write two lists: what is in your power and what isn’t. Spend your energy only on the first.',
    },
    {
      id: 'l-ench-5', who: 'epictetus', topic: 'mind',
      text: 'Men are disturbed not by the things which happen, but by the opinions about the things.',
      source: 'Enchiridion, 5', tr: 'George Long',
      meaning: 'A bad grade, a rude message or a missed bus doesn’t upset you by itself. The story you tell about it does: “this means I’m bad at this”. Change the story and the feeling changes with it.',
      ask: 'Think of the last thing that upset you. What did you tell yourself it meant?',
      try: 'The next time something stings, finish this sentence on paper: “What actually happened is…”. Leave the opinion out.',
    },
    {
      id: 'l-ench-33', who: 'epictetus', topic: 'habit',
      text: 'Be for the most part silent, or speak merely what is necessary, and in few words.',
      source: 'Enchiridion, 33', tr: 'Elizabeth Carter',
      meaning: 'Epictetus isn’t asking you to never talk. He’s asking you to notice how much of what you say is filler, and to let your words carry more weight by using fewer of them.',
      ask: 'When did you last say something only to fill a silence?',
      try: 'In your next class discussion or meeting, say one thing you’ve actually thought through instead of three things you haven’t.',
    },
    {
      id: 'l-med-2-1', who: 'marcus', topic: 'others',
      text: 'Begin the morning by saying to thyself, I shall meet with the busy-body, the ungrateful, arrogant, deceitful, envious, unsocial.',
      source: 'Meditations, 2.1', tr: 'George Long',
      meaning: 'Marcus wasn’t being gloomy. He was preparing. If you expect that some people will be difficult today, their behaviour stops being a shock that ruins your mood, and you can stay steady.',
      ask: 'Whose behaviour keeps catching you off guard, even though it’s predictable?',
      try: 'Tomorrow morning, take thirty seconds to picture one awkward moment you’re likely to meet, and decide now how you’ll respond.',
    },
    {
      id: 'l-med-4-17', who: 'marcus', topic: 'time',
      text: 'Do not act as if thou wert going to live ten thousand years. Death hangs over thee. While thou livest, while it is in thy power, be good.',
      source: 'Meditations, 4.17', tr: 'George Long',
      meaning: 'Putting things off assumes you have endless time. Marcus reminds himself that you don’t, not to scare himself, but to stop waiting for a better moment to act well.',
      ask: 'What have you been saving for “someday” that you could start this week?',
      try: 'Pick one thing you’ve been postponing and do the first ten minutes of it today.',
    },
    {
      id: 'l-med-6-6', who: 'marcus', topic: 'others',
      text: 'The best way of avenging thyself is not to become like the wrong doer.',
      source: 'Meditations, 6.6', tr: 'George Long',
      meaning: 'When someone treats you badly, the urge is to hit back in kind. Marcus points out that copying their behaviour is the real loss, because it makes you into the thing you disliked.',
      ask: 'When someone was unfair to you, how did you want to respond, and would you be proud of it?',
      try: 'The next time you want to reply sharply to a message, wait an hour and answer the way you’d want to be answered.',
    },
    {
      id: 'l-med-8-47', who: 'marcus', topic: 'mind',
      text: 'If thou art pained by any external thing, it is not this thing that disturbs thee, but thy own judgement about it. And it is in thy power to wipe out this judgement now.',
      source: 'Meditations, 8.47', tr: 'George Long',
      meaning: 'This is the same idea as Epictetus, written by an emperor to himself. The useful part is the last line: the judgement is yours, so you can drop it, and you can do it now rather than later.',
      ask: 'Which judgement about yourself would you most like to wipe out?',
      try: 'Name one thought that keeps hurting (“I’m always behind”). Write down one piece of evidence against it.',
    },
    {
      id: 'l-med-10-16', who: 'marcus', topic: 'habit',
      text: 'No longer talk at all about the kind of man that a good man ought to be, but be such.',
      source: 'Meditations, 10.16', tr: 'George Long',
      meaning: 'It’s easy to read, plan and talk about becoming disciplined. Marcus tells himself to stop describing the person he wants to be and simply act like them.',
      ask: 'What do you talk about wanting to do more than you actually do it?',
      try: 'Replace one plan with one action today: instead of a study timetable, study for twenty-five minutes.',
    },
    {
      id: 'l-med-2-11', who: 'marcus', topic: 'time',
      text: 'Since it is possible that thou mayest depart from life this very moment, regulate every act and thought accordingly.',
      source: 'Meditations, 2.11', tr: 'George Long',
      meaning: 'Remembering that life is short sharpens your choices. Small grudges, scrolling and busywork look different when you see the time they take as limited.',
      ask: 'If today were the last ordinary day for a while, what would you stop doing?',
      try: 'Look at how you spent yesterday evening. Keep one thing you’d choose again, and drop one thing you wouldn’t.',
    },
    {
      id: 'l-med-7-69', who: 'marcus', topic: 'habit',
      text: 'The perfection of moral character consists in this, in passing every day as the last, and in being neither violently excited nor torpid nor playing the hypocrite.',
      source: 'Meditations, 7.69', tr: 'George Long',
      meaning: 'Marcus describes a steady middle: not swinging between frantic and lazy, and not pretending. Treat each day as if it counts, and stay even while you do it.',
      ask: 'Do your weeks swing between cramming and doing nothing?',
      try: 'Set one small daily study habit you could keep even on a bad day, and keep it for a week.',
    },
    {
      id: 'l-sen-1', who: 'seneca', topic: 'time',
      text: 'Hold every hour in your grasp. Lay hold of to-day’s task, and you will not need to depend so much upon to-morrow’s.',
      source: 'Letters to Lucilius, 1', tr: 'Richard M. Gummere',
      meaning: 'Seneca’s first letter is about time slipping away unnoticed. Doing today’s work today is how you stop borrowing from a tomorrow that is never guaranteed.',
      ask: 'Which task have you already moved to “tomorrow” three times?',
      try: 'Write down the single most important task for today and finish it before you open anything else.',
    },
    {
      id: 'l-sen-13', who: 'seneca', topic: 'mind',
      text: 'There are more things, Lucilius, likely to frighten us than there are to crush us; we suffer more often in imagination than in reality.',
      source: 'Letters to Lucilius, 13', tr: 'Richard M. Gummere',
      meaning: 'Most of what we dread never happens, or turns out smaller than imagined. The suffering in the waiting is real, but much of it is suffering in advance.',
      ask: 'What are you dreading that hasn’t happened yet?',
      try: 'Before your next big test or talk, write the worst realistic outcome and what you would do next if it happened.',
    },
    {
      id: 'l-sen-2', who: 'seneca', topic: 'learning',
      text: 'Everywhere means nowhere.',
      source: 'Letters to Lucilius, 2', tr: 'Richard M. Gummere',
      meaning: 'Seneca is talking about reading. Skimming many books leaves you with acquaintances, not friends. Going deep into a few good ones is what actually changes how you think.',
      ask: 'How many things are you half-learning at the moment?',
      try: 'Choose one book or one subject to go deep on this month, and set the rest aside until you finish.',
    },
    {
      id: 'l-apology', who: 'socrates', topic: 'learning',
      text: 'The life which is unexamined is not worth living.',
      source: 'Plato, Apology', tr: 'Benjamin Jowett',
      meaning: 'At his trial Socrates refused to stop asking questions, even to save his life. For him, questioning your own beliefs was what made a life your own rather than borrowed.',
      ask: 'What do you believe mainly because people around you believe it?',
      try: 'Pick one opinion you hold strongly and write the best argument against it you can find.',
    },
    {
      id: 'l-ethics-1-7', who: 'aristotle', topic: 'habit',
      text: 'For one swallow does not make a summer, nor does one day; and so too one day, or a short time, does not make a man blessed and happy.',
      source: 'Nicomachean Ethics, I.7', tr: 'W. D. Ross',
      meaning: 'One good day of revision doesn’t make you good at a subject, and one bad day doesn’t ruin you. Aristotle judges a life by what it does over and over, which is why habits matter more than bursts.',
      ask: 'Are you judging yourself by one bad day?',
      try: 'Track a single habit for seven days with a tick on paper. Judge the week, not the day.',
    },
    {
      id: 'l-cratylus', who: 'heraclitus', topic: 'change',
      text: 'Heracleitus is supposed to say that all things are in motion and nothing at rest; he compares them to the stream of a river, and says that you cannot go into the same water twice.',
      source: 'Plato, Cratylus', tr: 'Benjamin Jowett',
      meaning: 'We only have Heraclitus through other writers, here Plato. The point: the river and the person stepping into it both keep changing. You aren’t the student you were last year, and you don’t have to be.',
      ask: 'What do you still believe about yourself that was only true a while ago?',
      try: 'Write one sentence about who you were a year ago and one about who you are now. Notice what changed.',
    },
  ];

  root.SonaLessons = { lessons: LESSONS, thinkers: THINKERS, topics: TOPICS };
})(typeof window !== 'undefined' ? window : globalThis);
