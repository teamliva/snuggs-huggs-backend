/**
 * One-off seeder: publishes 10 SEO blog posts for Snuggs & Huggs Senior
 * Services using the real write path (savePost), so slugs, markdown
 * rendering, TOC, word count and reading time all come out exactly like a
 * post saved through the admin editor.
 *
 * Run against the local dev database (backend must already be running):
 *   node scripts/with-local-db.js scripts/seed-blog-posts.mjs
 */
import { connectDb, disconnectDb } from "../src/config/db.js";
import { AdminUser } from "../src/models/AdminUser.js";
import { Category, Author } from "../src/models/blog.js";
import { savePost } from "../src/blog/posts.js";

const SITE = "https://snuggsandhuggsseniorservices.com";
const img = (file) => `${SITE}/images/${file}`;

const CATEGORIES = [
  { name: "Family Resources", slug: "family-resources", description: "Practical guidance for families weighing or arranging in-home senior care." },
  { name: "Senior Care Services", slug: "senior-care-services", description: "What our care services actually cover, day to day." },
  { name: "Dementia Care", slug: "dementia-care", description: "Supporting a loved one living with dementia or memory loss at home." },
  { name: "Caregiving Tips", slug: "caregiving-tips", description: "Everyday ideas for families and caregivers supporting aging loved ones." },
];

async function ensureAdmin() {
  const email = "content@snuggsandhuggsseniorservices.com";
  let admin = await AdminUser.findOne({ email });
  if (!admin) {
    admin = await AdminUser.create({
      email,
      name: "Content Team",
      role: "admin",
      passwordHash: await AdminUser.hashPassword("LocalSeedAdmin2026!"),
    });
    console.log(`Created local admin account: ${email}`);
  }
  return { id: String(admin._id), role: admin.role, email: admin.email, name: admin.name };
}

async function ensureCategories() {
  const map = new Map();
  for (const c of CATEGORIES) {
    let doc = await Category.findOne({ slug: c.slug });
    if (!doc) doc = await Category.create(c);
    map.set(c.slug, String(doc._id));
  }
  return map;
}

async function ensureAuthor() {
  let author = await Author.findOne({ slug: "michelle-wiley" });
  if (!author) {
    author = await Author.create({
      name: "Michelle Wiley",
      slug: "michelle-wiley",
      jobTitle: "Founder & Owner, Snuggs & Huggs Senior Services",
      bio: "Michelle founded Snuggs & Huggs Senior Services to bring compassionate, personalized in-home care to families across Greater Seattle.",
      avatarUrl: img("michelle-wiley-founder.jpg"),
      url: "",
      sameAs: ["https://www.facebook.com/people/Snuggs-and-Huggs-Senior-Services/61587125701535/"],
    });
    console.log("Created author: Michelle Wiley");
  }
  return String(author._id);
}

const POSTS = [
  {
    slug: "signs-your-aging-parent-needs-in-home-care",
    title: "10 Signs Your Aging Parent May Need In-Home Care",
    excerpt:
      "Subtle changes at home are often the first clue that a parent could use extra support. Here's what to watch for and how to start the conversation.",
    category: "family-resources",
    tags: ["in-home care", "aging parents", "seattle senior care"],
    focusKeyword: "signs aging parent needs care",
    secondaryKeywords: ["in-home care seattle", "when does a senior need help", "signs of needing home care"],
    seoTitle: "10 Signs Your Aging Parent May Need In-Home Care",
    seoDescription:
      "Noticing changes in a parent's home, habits, or health? These are the most common signs families see before arranging in-home senior care.",
    image: img("in-home-caregiver-with-senior-woman.jpg"),
    imageAlt: "Caregiver in Snuggs & Huggs scrubs sharing a cup of tea with a smiling senior woman at home",
    content: `Most families don't decide their parent needs help all at once. It's usually a collection of small things — a missed pill organizer, a pantry with three of the same item and nothing else, a phone call that feels a little more confused than usual. On their own, each moment seems explainable. Together, they're worth paying attention to.

Here are ten of the most common signs adult children notice first.

## Changes around the house

- Piles of unopened mail or unpaid bills
- Spoiled food in the refrigerator, or very little food at all
- Laundry that's stopped getting done
- A house that used to be tidy now cluttered or dusty
- Missed home or vehicle maintenance

## Changes in daily habits

- Wearing the same clothes for several days
- Skipping showers or grooming that used to be routine
- Weight loss, or meals that have gotten simpler and less frequent
- Medications taken at the wrong time, doubled up, or skipped

## Changes in mood and memory

A parent who seems more withdrawn, more irritable, or less interested in calls and visits than they used to be is telling you something, even if they don't say it directly. So is repeating the same question or story within a single conversation, or seeming unsure of the day or time more often than before.

## It's rarely just one thing

Any single item on this list could have an ordinary explanation. What matters is the pattern — several of these showing up around the same time, or getting more noticeable over a few months. That's usually the point where a conversation about support is overdue rather than early.

## Starting the conversation

Bringing this up with a parent is rarely easy. It helps to lead with specifics rather than generalities — "I noticed the mail was piling up" lands better than "you're not managing." It also helps to frame extra help as protecting their independence rather than replacing it: the right in-home support is often what lets someone stay in their own home longer, not what forces them to leave it.

## What in-home care actually looks like

At Snuggs & Huggs, most families start with [personal care](/services/personal-care) and [homemaker services](/services/homemaker-services) — help with hygiene, meals, medication reminders, and the everyday tasks that had quietly become difficult. From there, a [care coordination](/services/care-coordination) plan keeps appointments, updates, and the wider family on the same page.

If any of this sounds familiar, a conversation doesn't commit you to anything. It's simply the fastest way to find out what kind of support would actually help.`,
  },
  {
    slug: "personal-care-vs-companion-care",
    title: "Personal Care vs. Companion Care: What's the Difference?",
    excerpt:
      "Two of the most requested home care services sound similar but cover very different needs. Here's how to tell which one — or both — fits your family.",
    category: "senior-care-services",
    tags: ["personal care", "companion care", "in-home care"],
    focusKeyword: "personal care vs companion care",
    secondaryKeywords: ["what is companion care", "what is personal care", "home care services explained"],
    seoTitle: "Personal Care vs. Companion Care: What's the Difference?",
    seoDescription:
      "Personal care and companion care solve different problems. This guide breaks down what each includes so you can choose the right fit for your loved one.",
    image: img("personal-care-caregiver-brushing-hair.jpg"),
    imageAlt: "A caregiver gently brushing a senior woman's hair at her dressing table",
    content: `When families first call about in-home care, one of the first questions is usually some version of "what's actually included?" Two of our most common services — personal care and companion care — get confused for each other because they're often provided by the same caregiver in the same visit. But they solve different problems.

## What personal care covers

[Personal care](/services/personal-care) is hands-on help with the physical routines of a day: bathing, dressing, grooming, toileting, and medication reminders. It's the kind of support that matters most when a task has become physically difficult or unsafe to do alone — getting in and out of the shower safely, for example, or remembering which pills come with breakfast.

This is help delivered with dignity and privacy in mind, at the pace and preference of the person receiving it. It's usually the first service families add when independence with self-care starts to slip.

## What companion care covers

[Companion care](/services/companion-care) is built around connection rather than physical assistance. A companion caregiver spends time with your loved one — conversation, games, hobbies, walks, cognitive engagement — and simply being present so the day doesn't feel isolating.

Isolation is a quiet risk for seniors who live alone or whose family is spread out. Companion care addresses that directly, and it's often what makes the biggest difference in someone's mood and outlook, even when their physical needs are minimal.

## How families usually combine them

Many care plans include both. A caregiver might help with a morning routine — personal care — and then stay for a game of cards or a walk around the block — companion care — in the same visit. Our [Standard Care plan](/#care) includes personal hygiene, dressing, and bathing alongside recreation and companionship for exactly this reason: the two rarely stand alone in real life.

## How to decide where to start

Ask which is harder for your loved one right now: managing physical self-care tasks safely, or getting through long stretches of the day without company. If it's the first, start with personal care. If it's the second, start with companion care. If it's both — which is common — a blended plan built around your family's actual routine is usually the right answer.

A free consultation is the easiest way to sort this out. We'll ask about a typical day, listen to what's changed, and recommend the mix of support that actually fits — not a generic package.`,
  },
  {
    slug: "guide-to-dementia-memory-care-at-home",
    title: "A Family Guide to Dementia and Memory Care at Home",
    excerpt:
      "In-home dementia care works best when it's built around routine and familiar faces. Here's what that support actually looks like day to day.",
    category: "dementia-care",
    tags: ["dementia care", "memory care", "caregiving tips"],
    focusKeyword: "dementia care at home",
    secondaryKeywords: ["memory care seattle", "in-home dementia support", "caring for a parent with dementia"],
    seoTitle: "A Family Guide to Dementia and Memory Care at Home",
    seoDescription:
      "What in-home dementia care looks like day to day — routine, familiar caregivers, engagement activities, and how families stay involved.",
    image: img("companion-care-word-game-with-seniors.jpg"),
    imageAlt: "A caregiver playing a word board game with a senior couple in their living room",
    content: `A dementia diagnosis changes the questions a family is asking. It's no longer just "who can help with groceries" — it's "how do we keep our parent safe, engaged, and comfortable in the home they know, for as long as that's possible." In-home [dementia and memory care](/services/dementia-care) is built around that specific question.

## Why routine and familiar faces matter

For someone living with dementia, consistency itself is a form of comfort. The same caregiver, arriving at the same time, following a similar routine, reduces the confusion and anxiety that unfamiliar changes can cause. That's why continuity of care — the same trained caregiver whenever possible — is a core part of how we structure memory care support, rather than rotating whoever's available.

## What day-to-day support includes

Dementia and memory care support is available through our Premium and All-Inclusive care plans and can include:

- An activity and engagement program suited to the person's interests and current abilities
- Customized cognitive activities designed around what still brings them enjoyment
- Continuity care with the same familiar caregivers
- Quarterly assessment updates so the plan evolves as needs change

The goal isn't to fill time — it's to give each day some shape and a few moments of real engagement, which matters as much for wellbeing as any physical task.

## Keeping the family connected

Families managing a loved one's dementia care from a distance, or around full-time jobs, often worry most about not knowing how the day actually went. That's what our [care coordination](/services/care-coordination) and family update tools are for: a care journal with photo updates and daily digital updates, so the family can see how things are going without having to ask.

## Supporting the family, too

Dementia caregiving is demanding on the people around it, not just the person receiving care. Respite — even a few hours a week where a trained caregiver takes over — often makes the difference between a family that's managing and a family that's burning out. It's worth asking about early, not after things get hard.

## Getting started

Every family's situation with dementia looks different, depending on stage, personality, and what's already in place at home. A free consultation lets us walk through where things stand right now and build a plan around it — no assumptions, no one-size-fits-all package.`,
  },
  {
    slug: "homemaker-services-help-seniors-stay-independent",
    title: "5 Ways Homemaker Services Help Seniors Stay Independent",
    excerpt:
      "Homemaker services rarely make headlines, but they're often what keeps an aging parent safely in their own home. Here's what's actually included.",
    category: "senior-care-services",
    tags: ["homemaker services", "aging in place", "in-home care"],
    focusKeyword: "homemaker services for seniors",
    secondaryKeywords: ["home management for seniors", "meal planning for elderly", "aging in place support"],
    seoTitle: "5 Ways Homemaker Services Help Seniors Stay Independent",
    seoDescription:
      "Meal planning, groceries, home management, and medication reminders — how homemaker services quietly keep seniors safe and independent at home.",
    image: img("homemaker-caregiver-serving-meal-to-senior.jpg"),
    imageAlt: "A caregiver serving a home-cooked meal to a smiling senior man at his dining table",
    content: `When people picture home care, they usually picture personal care — help with bathing or dressing. What's easy to overlook is how much independence actually depends on the quieter, everyday work of running a household. That's what [homemaker services](/services/homemaker-services) cover, and it's often the support that keeps a parent safely in their own home the longest.

## 1. Meal planning that actually happens

Cooking for one person, several times a day, every day, is a bigger task than it sounds — and it's one of the first things to slip when energy or mobility declines. Homemaker support includes meal planning so nutrition doesn't depend on whether today was a good or a hard day.

## 2. Groceries, without the trip

Grocery shopping assistance means the pantry and fridge stay stocked with what a senior actually eats, without the physical toll (or driving risk) of a weekly store trip.

## 3. A home that's easier to manage

General home management — tidying, laundry, basic upkeep — sounds minor until it isn't done. A cluttered home is also a less safe one, especially for anyone managing mobility or balance issues. Keeping the home orderly is itself a fall-prevention measure.

## 4. Medication reminders that reduce risk

Medication reminders are part of nearly every care plan we build, homemaker or personal care alike. Missed or doubled-up doses are one of the more common (and preventable) risks for seniors managing multiple prescriptions.

## 5. Appointments that don't get missed

Scheduling medical appointments and keeping track of them is easy to underestimate until a specialist visit gets missed or double-booked. This is where homemaker support connects with our broader [care coordination](/services/care-coordination) service to keep the whole picture organized.

## Independence, not dependence

The point of homemaker services isn't to take over — it's to remove the tasks that have become genuinely hard, so a senior can keep doing the things they still want to do without the household falling into disrepair around them. For a lot of families, this is the very first service that opens the door to broader care conversations, simply because it solves the most visible, most stressful problem first.

If mail is piling up, meals are getting simpler, or the fridge tells a different story than it used to, a free consultation can help you figure out exactly what kind of support would help most.`,
  },
  {
    slug: "what-is-care-coordination",
    title: "What Is Care Coordination — and Why It Matters for Busy Families",
    excerpt:
      "Between appointments, medications, and updates, managing a parent's care can become a second job. Here's what care coordination actually takes off your plate.",
    category: "senior-care-services",
    tags: ["care coordination", "family caregiving", "in-home care"],
    focusKeyword: "care coordination for seniors",
    secondaryKeywords: ["senior care management", "family caregiver support", "coordinating elderly care"],
    seoTitle: "What Is Care Coordination — and Why It Matters",
    seoDescription:
      "Appointments, care plans, transportation, and family updates — how care coordination keeps a senior's care organized so families don't have to.",
    image: img("care-coordination-reviewing-care-plan.jpg"),
    imageAlt: "A caregiver and a senior woman reviewing a health plan and appointment calendar together",
    content: `A lot of the stress in caring for an aging parent isn't any single task — it's keeping track of everything at once. Which appointment is when. Which medication changed last visit. Whether the sibling out of state actually knows what happened this week. [Care coordination](/services/care-coordination) exists to take that organizational load off a family's shoulders.

## The pieces care coordination brings together

- Scheduling and tracking medical appointments
- Building and updating a personalized care plan
- Arranging transportation to appointments and errands
- Monthly care conferences to review how things are going
- 24/7 social support so questions don't wait for business hours
- Daily digital updates so family members stay informed without having to ask

## Why "who's tracking this" is the real question

Most families don't struggle because they don't care — they struggle because caregiving competes with a full-time job, kids, and everything else on a calendar. Care coordination isn't about doing anything more than what a devoted family member would already do; it's about making sure someone is doing it consistently, even on the weeks that get away from everyone else.

## Keeping distant family in the loop

For families with siblings or children living out of the area, the hardest part is often just not knowing what's happening day to day. Our care journal with photo updates and daily digital updates were built specifically for this — a way to see how a parent's day actually went, not just hear a summary during a weekend phone call.

## Monthly care conferences

Care needs shift, sometimes gradually and sometimes quickly. A monthly care conference is a scheduled check-in to review what's working, what's changed, and whether the plan needs adjusting — rather than waiting for a crisis to prompt the conversation.

## Where this fits into a care plan

Care coordination is included in our [Premium and All-Inclusive care plans](/#compare), layered on top of the everyday support in [personal care](/services/personal-care) and [homemaker services](/services/homemaker-services). Together, they cover both the hands-on help and the behind-the-scenes organization that keeps everything running smoothly.

If keeping track of your parent's care has started to feel like an unpaid second job, that's exactly the problem care coordination is meant to solve. A free consultation is a good place to see what it would look like for your family specifically.`,
  },
  {
    slug: "standard-premium-all-inclusive-care-plans-explained",
    title: "Standard, Premium, or All-Inclusive: Choosing the Right Care Plan",
    excerpt:
      "Three care levels, one goal: matching the right amount of support to what your family actually needs. Here's how the plans differ.",
    category: "family-resources",
    tags: ["care plans", "senior care", "family resources"],
    focusKeyword: "senior care plan levels",
    secondaryKeywords: ["standard vs premium home care", "all-inclusive senior care", "choosing a care plan"],
    seoTitle: "Standard, Premium, or All-Inclusive: Choosing a Care Plan",
    seoDescription:
      "A plain-language breakdown of Standard, Premium, and All-Inclusive in-home care plans, and how to know which level of support fits your family.",
    image: img("family-care-consultation.jpg"),
    imageAlt: "A caregiver reviewing care paperwork with three generations of a family around a table",
    content: `One of the more common questions we hear is some version of "how do we know how much care we actually need?" There's no universal answer, but breaking down what each of our three care levels includes usually makes the decision much clearer.

## Standard Care: foundational support

[Standard Care](/#care) covers the essentials of daily living: personal hygiene, dressing, and bathing; meal planning and home management; medication reminders and scheduling appointments; grocery shopping assistance; and recreational activities, all built around a tailored care plan. This is the right starting point for families whose loved one is managing reasonably well but needs consistent help with the day-to-day.

## Premium Care: added coordination and oversight

[Premium Care](/#care) includes everything in Standard Care, plus a meaningfully deeper layer of support:

- Monthly care conferences and quarterly assessment updates
- 24/7 social support and concierge care coordination
- Transportation and continuity care with trained caregivers
- Dementia and memory care support with an activity and engagement program
- A care journal with photo updates and daily digital updates for family

Premium Care tends to fit families who want a more connected, closely managed experience — especially if a loved one's needs are becoming more complex, or family members live too far away to check in as often as they'd like.

## All-Inclusive: complete, customized support

[All-Inclusive](/#care) builds on Premium Care with customized cognitive activities, personalized recreational activities, and every premium add-on included as standard. It's designed for families who want the most comprehensive, most personalized level of support available, without having to select add-ons individually.

## How to actually choose

Rather than starting from the plan names, start from the situation: What does a typical day look like right now? What's changed in the last few months? Is the bigger concern daily tasks, medical coordination, memory and engagement, or all three? The honest answer to those questions usually points clearly toward one plan — and it's exactly what we walk through during a [family consultation](/#matching).

Care levels aren't fixed forever, either. Plans can be adjusted as needs change, which is one of the reasons ongoing assessments and care conferences are built into Premium and All-Inclusive from the start.

There's no published price list because every plan is built around the specific person receiving care — the schedule, the services involved, and the level of support all factor in. A free consultation is the fastest way to get a clear, personalized recommendation and quote.`,
  },
  {
    slug: "caregiver-matching-process-explained",
    title: "What to Expect: Our Caregiver Matching Process, Step by Step",
    excerpt:
      "Finding the right caregiver isn't a single decision — it's a process. Here's exactly what happens between your first call and a caregiver who feels like family.",
    category: "family-resources",
    tags: ["caregiver matching", "family resources", "getting started"],
    focusKeyword: "caregiver matching process",
    secondaryKeywords: ["how to choose a caregiver", "in-home care trial period", "finding a home caregiver"],
    seoTitle: "Our Caregiver Matching Process, Step by Step",
    seoDescription:
      "From the first family consultation to a monitored trial period, here's exactly how we match your loved one with the right in-home caregiver.",
    image: img("meeting-your-caregiver-handshake.jpg"),
    imageAlt: "A caregiver and a senior man shaking hands as they meet for the first time",
    content: `Choosing someone to help care for a parent is a big decision, and it rarely feels comfortable to make quickly. That's why caregiver matching at Snuggs & Huggs is a process, not a single phone call — four steps designed to make sure the fit is right before anything becomes permanent.

## Step 1: Family consultation

It starts with a focused, roughly two-hour conversation about routines, needs, personality, and priorities. This isn't a sales pitch — it's genuinely trying to understand who your loved one is, what a good day looks like for them, and what's actually changed recently. Everything that follows is built on what we learn here.

## Step 2: Caregiver introductions

Rather than assigning a caregiver, we introduce your family to two or three caregiver options. Personality fit matters as much as skill — someone your loved one is comfortable with, talks easily with, and genuinely looks forward to seeing. Your family makes the final, informed choice.

## Step 3: Monitored trial

Once a caregiver is chosen, a 7–14 day trial period begins, with daily check-ins and overnight monitoring available when arranged. This is a real trial — not a formality — so any friction or mismatch shows up quickly, while it's still easy to adjust.

## Step 4: Refine the plan

Feedback from the trial period shapes the ongoing arrangement. Schedules, tasks, and even the caregiver assignment can be adjusted until it genuinely feels right for your loved one and your family — not just workable, but right.

## Why the process matters more than the paperwork

Plenty of agencies can send someone to your door quickly. What actually determines whether in-home care works long-term is whether the caregiver and the client get along, whether the schedule fits real life, and whether the family trusts what's happening when they're not there. Building in real introductions and a real trial period is how we protect that, rather than treating the first caregiver sent as the final answer.

## Starting the process

The only way to begin is a conversation — no obligation, and no assumptions about what your family needs before we've actually talked. If you're trying to figure out where to start, a free consultation is designed to be exactly that starting point.`,
  },
  {
    slug: "aging-in-place-seattle-guide",
    title: "Aging in Place in Seattle: What It Takes to Stay Home Safely",
    excerpt:
      "Most seniors want to stay in the home they know. Here's what actually makes that possible, and where in-home care fits into the picture.",
    category: "caregiving-tips",
    tags: ["aging in place", "seattle senior care", "home safety"],
    focusKeyword: "aging in place seattle",
    secondaryKeywords: ["staying home as you age", "home safety for seniors", "in-home care seattle"],
    seoTitle: "Aging in Place in Seattle: Staying Home Safely",
    seoDescription:
      "What aging in place actually requires — home safety, daily support, and coordination — and how in-home care helps Seattle families make it work.",
    image: img("caregiver-check-in-with-senior-on-tablet.jpg"),
    imageAlt: "A caregiver noting a senior woman's check-in details on a tablet in her living room",
    content: `Given the choice, most seniors would rather stay in the home they've lived in for years than move to a facility. "Aging in place" is the term for exactly that — remaining at home safely and comfortably as needs change, rather than relocating because of them. For families across Greater Seattle, it's usually possible with the right support in place.

## It starts with an honest look at the home

Aging in place isn't just a preference — it takes some groundwork. Stairs, bathroom safety, lighting, and clutter all affect fall risk, which is one of the most common reasons an otherwise capable senior ends up needing a higher level of care sooner than expected. A clear-eyed look at the home itself is often the first step, before deciding what kind of ongoing support makes sense.

## Daily support fills the real gaps

Beyond the physical space, aging in place depends on whether the daily routine actually works. That's where services like [personal care](/services/personal-care) and [homemaker services](/services/homemaker-services) come in — hygiene, meals, medication reminders, and home management, handled consistently, so small tasks don't turn into safety issues.

## Staying connected matters as much as staying safe

Isolation is a real risk for seniors living alone, even in a perfectly safe home. [Companion care](/services/companion-care) — conversation, activities, and simple company — addresses the part of aging in place that's about wellbeing, not just physical safety.

## Coordination keeps the whole picture together

As needs grow — more appointments, more medications, more moving pieces — [care coordination](/services/care-coordination) keeps everything organized: appointments, care plans, transportation, and updates for family members who want to stay informed without managing it themselves.

## When to bring in support

There's no single right moment to start — some families begin with light homemaker support years before anything more is needed, while others start after a specific event, like a fall or a hospital stay. What matters more than timing is matching the level of support to what's actually happening at home right now, and adjusting as things change.

Serving families throughout Greater Seattle, our team can help assess what aging in place would actually take for your specific situation. A free consultation is a low-pressure way to start that conversation.`,
  },
  {
    slug: "questions-to-ask-before-hiring-in-home-caregiver",
    title: "10 Questions to Ask Before Hiring an In-Home Caregiver",
    excerpt:
      "Choosing a home care provider is a big decision made under time pressure. These are the questions worth asking before you commit.",
    category: "family-resources",
    tags: ["hiring a caregiver", "in-home care", "family resources"],
    focusKeyword: "questions to ask home care agency",
    secondaryKeywords: ["how to choose a home care provider", "hiring an in-home caregiver", "vetting a caregiver"],
    seoTitle: "10 Questions to Ask Before Hiring an In-Home Caregiver",
    seoDescription:
      "The questions worth asking any in-home care provider before you commit — from caregiver matching to communication to what's actually included.",
    image: img("caregiver-and-senior-updating-care-journal.jpg"),
    imageAlt: "A senior woman and her caregiver laughing together while updating a care journal",
    content: `Families usually start looking into in-home care during a stressful moment — after a fall, a hospital stay, or a hard conversation that's been put off too long. That time pressure makes it easy to skip questions that matter. Here are ten worth asking any provider you're considering.

## 1. How do you match caregivers with clients?

Ask whether you'll meet more than one caregiver option, or simply be assigned whoever is available. Personality fit affects everything else, so a real matching process is worth prioritizing.

## 2. Is there a trial period?

A monitored trial — with regular check-ins — lets you find out quickly whether an arrangement is working, before it becomes a long-term commitment either family finds hard to undo.

## 3. What exactly is included at each care level?

"Personal care," "companion care," and "care coordination" mean different things to different agencies. Ask for a specific list of what's covered — hygiene and dressing, meals and home management, appointments and transportation, memory support — rather than a general description.

## 4. How do you keep the family informed?

If you're not the only decision-maker, or you live out of the area, ask how updates are shared. Daily digital updates and a care journal are very different from a phone call whenever something goes wrong.

## 5. What happens if a caregiver is unavailable?

Ask how coverage works for sick days, vacations, or scheduling conflicts, and whether continuity with the same familiar caregiver is a priority for the agency.

## 6. Do you support dementia or memory care specifically?

Not every caregiver is suited to memory care. Ask whether dementia support is built into a specific plan, with engagement activities tailored to the person, or treated the same as general companion care.

## 7. How are care plans adjusted over time?

Needs change. Ask whether reassessments and care conferences are a regular, scheduled part of the service, or something you'd have to request and push for yourself.

## 8. Is transportation included?

If appointments, errands, or social outings require transportation, confirm whether that's part of the plan or an extra you'd need to arrange separately.

## 9. What's the process for concerns or complaints?

Ask how the agency handles a caregiver mismatch or a concern about care quality, and how quickly you can expect a response.

## 10. What does this actually cost?

Reasonable providers won't give a number without understanding your situation first — but they should be able to walk you through exactly what factors into the quote (level of care, schedule, specific services) so pricing doesn't feel like a mystery.

At Snuggs & Huggs, these are exactly the questions a [free consultation](/#consultation) is built to answer — clearly, and without pressure to decide on the spot.`,
  },
  {
    slug: "supporting-loved-one-with-dementia-during-holidays",
    title: "Supporting a Loved One with Dementia During the Holidays",
    excerpt:
      "Holidays bring more people, more noise, and more change than a usual day — all things that can be hard for someone living with dementia. Here's how to make the season easier.",
    category: "dementia-care",
    tags: ["dementia care", "holidays", "caregiving tips"],
    focusKeyword: "dementia care during holidays",
    secondaryKeywords: ["holidays with dementia patient", "caregiving during holidays", "memory care tips"],
    seoTitle: "Supporting a Loved One with Dementia During the Holidays",
    seoDescription:
      "Practical ways to make holiday gatherings easier for a loved one with dementia — from routine to environment to knowing when to ask for support.",
    image: img("companion-care-word-game-with-seniors.jpg"),
    imageAlt: "A caregiver playing a word board game with a senior couple in their living room",
    content: `Holidays are supposed to feel joyful, but for a family caring for someone with dementia, they can bring a specific kind of stress: more people, more noise, more change to a routine that usually provides comfort and stability. A little planning goes a long way toward keeping the season enjoyable for everyone, including the person at the center of it.

## Protect the routine as much as possible

Big gatherings often mean later meals, later bedtimes, and a house full of unfamiliar activity. Where you can, keep mealtimes, medication schedules, and rest periods close to normal, even on a holiday. Consistency reduces the disorientation that schedule changes can cause.

## Prepare guests, not just the environment

Family members who don't see your loved one often may not know what's changed since last time — new confusion, different triggers, a need for shorter visits. A quick heads-up beforehand (repeat things calmly, avoid correcting mistakes, keep visits shorter than they used to be) helps guests respond with patience instead of surprise.

## Create a quiet space

A large gathering can be overstimulating even for someone without memory challenges. Having a quieter room available — somewhere to step away from noise and crowds for a break — gives your loved one an option that doesn't require leaving the event entirely.

## Focus on familiar traditions

Familiar music, favorite foods, or a small ritual that's been part of the holiday for years can provide real comfort, even when a lot of the day feels unfamiliar or overwhelming. Recognition matters more than novelty here.

## Watch for signs of overwhelm

Increased agitation, withdrawal, or repetitive questions are often signs that it's time for a break, not a sign that something is going wrong. Responding early, with a quiet moment or an early exit, usually prevents a harder moment later.

## It's okay to ask for support

Holidays are a common time for family caregivers to reach their limit, especially on top of everything else the season demands. If a gathering feels like more than you can manage alone, in-home [dementia and memory care](/services/dementia-care) support — even just for the day — can make it possible to actually enjoy the occasion instead of only managing it.

If this holiday season feels harder than it should, we're glad to talk through what kind of support might help, with no pressure and no assumptions about what your family needs.`,
  },
];

async function run() {
  await connectDb();

  const admin = await ensureAdmin();
  const categories = await ensureCategories();
  const authorId = await ensureAuthor();

  let day = 0;
  for (const p of POSTS) {
    const publishedAt = new Date(Date.now() - (POSTS.length - day) * 4 * 24 * 60 * 60 * 1000).toISOString();
    day += 1;

    const input = {
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      content: p.content,
      featuredImageUrl: p.image,
      featuredImageAlt: p.imageAlt,
      category: categories.get(p.category),
      author: authorId,
      tags: p.tags,
      publishedAt,
      featured: false,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      focusKeyword: p.focusKeyword,
      secondaryKeywords: p.secondaryKeywords,
      schemaType: "BlogPosting",
    };

    const post = await savePost({ input, intent: "publish", user: admin });
    console.log(`Published: ${post.title}  ->  /blog/${post.slug}`);
  }

  console.log(`\nDone. ${POSTS.length} posts published.`);
  await disconnectDb();
}

run().catch((err) => {
  console.error("Seeding failed:", err);
  process.exitCode = 1;
});
