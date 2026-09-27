/**
 * Second batch: 10 more SEO blog posts for Snuggs & Huggs Senior Services,
 * covering search topics the first batch didn't (see scripts/seed-blog-posts.mjs
 * for the first 10 and the shared conventions this follows).
 *
 * Run against the local dev database (backend must already be running):
 *   node scripts/with-local-db.js scripts/seed-blog-posts-2.mjs
 */
import { randomBytes } from "node:crypto";
import { connectDb, disconnectDb } from "../src/config/db.js";
import { AdminUser } from "../src/models/AdminUser.js";
import { Category, Author } from "../src/models/blog.js";
import { savePost } from "../src/blog/posts.js";

const SITE = "https://snuggsandhuggsseniorservices.com";
const img = (file) => `${SITE}/images/${file}`;

// Same four categories the first batch created — looked up here, not
// recreated, but the shape is repeated so this script also works standalone
// against an empty database.
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
    const password = randomBytes(24).toString("hex");
    admin = await AdminUser.create({
      email,
      name: "Content Team",
      role: "admin",
      passwordHash: await AdminUser.hashPassword(password),
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
  }
  return String(author._id);
}

const POSTS = [
  {
    slug: "talking-to-a-parent-who-refuses-help",
    title: "How to Talk to a Parent Who Refuses In-Home Care",
    excerpt:
      "Bringing up in-home care with a proud, independent parent is rarely a single conversation. Here's how to approach it in a way that respects their autonomy.",
    category: "family-resources",
    tags: ["family caregiving", "difficult conversations", "personal care"],
    focusKeyword: "parent refuses help at home",
    secondaryKeywords: ["talking to aging parent about care", "elderly parent won't accept help", "convincing parent to get care"],
    seoTitle: "How to Talk to a Parent Who Refuses In-Home Care",
    seoDescription:
      "Practical, respectful ways to open the conversation when a parent resists help at home — and why the first no is rarely the last word.",
    image: img("family-care-consultation.jpg"),
    imageAlt: "A caregiver reviewing care paperwork with three generations of a family around a table",
    content: `"I don't need anyone's help." It's one of the most common sentences adult children hear when they first raise the idea of in-home care — and one of the hardest to know how to respond to. A parent's resistance usually isn't really about the help itself. It's about what accepting it seems to mean: losing independence, admitting decline, becoming a burden.

## Understand what the "no" is protecting

For most people, home is where they've raised a family, built a career, and made their own decisions for decades. A stranger coming into that space to help with bathing or medication can feel like the first step toward losing all of it. Recognizing that the resistance is about dignity and control — not stubbornness — changes how you approach the conversation.

## Lead with specific observations, not general concerns

"I'm worried about you" is easy to dismiss. "I noticed the stove was left on twice last week" is harder to argue with. Specific, recent examples ground the conversation in what's actually happening rather than a vague sense that something should change.

## Frame help as protecting independence, not replacing it

The most persuasive reframe is often the simplest: the right support is what lets someone stay in their own home longer, not what forces them out of it. A few hours of help with meals and hygiene each week is a very different proposition than "moving to a facility," and it's worth being explicit about that difference.

## Start smaller than you think you need to

An all-at-once care plan can feel like an ultimatum. Starting with something limited — a few hours a week of [homemaker services](/services/homemaker-services) or [companion care](/services/companion-care) — gives a parent room to experience the benefit before committing to more. Many families find the resistance softens considerably after the first few visits, once a caregiver stops being a hypothetical stranger and becomes someone familiar.

## Bring in a neutral third party

Sometimes a parent will hear the same message more easily from a doctor, or from the care agency itself during a no-obligation [family consultation](/#matching), than from their own child. It's not a failure to ask for that kind of help — it's often the fastest path to a "yes."

## It may take more than one conversation

Few families change a parent's mind in a single sitting. Plan to revisit the topic, especially after any change in health, a fall, or a hospital stay — moments that often shift what feels acceptable. Patience here isn't giving up; it's recognizing that a decision this personal deserves time.

If you're in the middle of this conversation right now, you don't have to figure out the right words alone. A free consultation is a low-pressure way to get a second perspective on how to approach it.`,
  },
  {
    slug: "in-home-care-vs-assisted-living",
    title: "In-Home Care vs. Assisted Living: Which Is Right for Your Parent?",
    excerpt:
      "Both options can offer real safety and support. Here's how they actually differ, and the questions that help a family choose between them.",
    category: "family-resources",
    tags: ["in-home care", "assisted living", "seattle senior care"],
    focusKeyword: "in-home care vs assisted living",
    secondaryKeywords: ["home care or assisted living", "aging in place vs moving", "senior care options compared"],
    seoTitle: "In-Home Care vs. Assisted Living: Which Is Right?",
    seoDescription:
      "A plain-language comparison of in-home care and assisted living — what each actually involves, and how to think through the decision for your parent.",
    image: img("in-home-caregiver-with-senior-woman.jpg"),
    imageAlt: "Caregiver in Snuggs & Huggs scrubs sharing a cup of tea with a smiling senior woman at home",
    content: `Families comparing in-home care to assisted living are usually comparing two different things without realizing it: a service (care that comes to you) and a place (a facility you move into). Understanding that distinction makes the rest of the decision much clearer.

## What in-home care actually means

[In-home care](/services/personal-care) brings support to your parent's own house or apartment — help with hygiene, meals, medication reminders, companionship, and coordination, scheduled around however many hours make sense. Your parent keeps their home, their neighborhood, their routine, and their belongings exactly where they are.

## What assisted living actually means

Assisted living is a residential facility where your parent would live, typically with private or semi-private housing, on-site staff, and communal dining and activities. It offers built-in social contact and staff availability around the clock, in exchange for leaving the home they know.

## Where in-home care tends to fit better

- Your parent has said clearly that they want to stay in their own home
- Their needs are focused on specific tasks — hygiene, meals, medication, transportation — rather than needing supervision at all hours
- Familiar surroundings meaningfully help with orientation, especially for early-stage memory concerns
- A spouse or family member is still in the home and wants to remain together

## Where assisted living tends to fit better

- Isolation is a bigger concern than any single physical task, and built-in daily social contact would help
- The home itself has become unsafe in ways that can't reasonably be modified — stairs, layout, rural distance from services
- Your parent has expressed a preference for community living, or the maintenance of a house has become the actual burden

## The questions worth asking together

Rather than debating in the abstract, walk through it as specific questions with your parent: What do you want a typical day to look like? What would you miss most about leaving home? What worries you most about staying? The honest answers usually point toward one option more clearly than any general pros-and-cons list.

## It's not always permanent, either way

Plenty of families start with in-home care and revisit the decision as needs change — that's exactly why care levels like [Premium and All-Inclusive Care](/#care) exist, adding deeper coordination and memory support without requiring a move. The right choice today isn't necessarily the only choice, ever.

If your family is somewhere in the middle of this decision, a free consultation can help you think through your parent's specific situation rather than deciding in the abstract.`,
  },
  {
    slug: "fall-prevention-checklist-for-seniors-at-home",
    title: "Fall Prevention at Home: A Room-by-Room Checklist for Seniors",
    excerpt:
      "Most falls happen at home, and most home hazards are fixable. Here's a practical, room-by-room look at what to check.",
    category: "caregiving-tips",
    tags: ["home safety", "fall prevention", "personal care"],
    focusKeyword: "fall prevention for seniors at home",
    secondaryKeywords: ["home safety checklist elderly", "preventing falls in seniors", "senior home hazards"],
    seoTitle: "Fall Prevention at Home: A Room-by-Room Checklist",
    seoDescription:
      "A practical, room-by-room checklist for reducing fall risk in a senior's home — lighting, bathrooms, stairs, and the small hazards that add up.",
    image: img("personal-care-caregiver-brushing-hair.jpg"),
    imageAlt: "A caregiver gently brushing a senior woman's hair at her dressing table",
    content: `A fall is one of the most common reasons an otherwise independent senior ends up needing more support, sooner than expected. Most falls happen inside the home, and most of the hazards that cause them are fixable without a renovation. Here's a practical walk-through, room by room.

## Entryways and hallways

- Clear pathways of loose rugs, cords, and clutter — anything that could catch a foot
- Add non-slip backing to any rug that stays
- Make sure light switches are reachable right at the entrance, not across a dark room

## Bathrooms

The bathroom is the highest-risk room in most homes, largely because of wet, hard surfaces.

- Grab bars near the toilet and inside the shower or tub, mounted into studs, not just drywall
- A non-slip mat inside the tub or shower, and a bath mat with a rubber backing outside it
- A raised toilet seat if standing up is becoming difficult
- A shower chair, if standing through a full shower has become tiring or unsteady

## Stairs

- Handrails on both sides, the full length of the staircase
- Even, bright lighting at both the top and bottom — a switch at each end, not just one
- Reflective tape or a contrasting color on the edge of each step, especially if vision has changed

## Bedroom

- A lamp within reach of the bed, so a nighttime trip to the bathroom doesn't start in the dark
- A clear, obstacle-free path from bed to bathroom
- A bed height that allows feet to reach the floor comfortably when sitting on the edge

## Kitchen

- Frequently used items stored at waist to shoulder height, so a step stool isn't part of the daily routine
- A sturdy chair nearby for tasks that take a while, like waiting on the stove

## General lighting and footwear

Dim lighting and unsupportive footwear are two of the simplest, most overlooked contributors to falls. Brighter bulbs throughout, night lights in hallways and bathrooms, and shoes with a back and non-slip sole (rather than loose slippers) make a real difference.

## Where a caregiver's eyes help

A room can look safe to someone who's lived in it for thirty years and stopped noticing its risks. Part of what a [personal care](/services/personal-care) caregiver brings is a second, practiced set of eyes — noticing the loose stair rail or the rug that's become a habit to step over, rather than a hazard waiting to be fixed.

If a recent fall — or a near-miss — has your family thinking about extra support at home, a free consultation is a good place to start figuring out what would actually help.`,
  },
  {
    slug: "signs-of-caregiver-burnout",
    title: "Signs of Caregiver Burnout — and How Respite Care Helps",
    excerpt:
      "Family caregivers often push through exhaustion long past the point they'd tell someone else to stop. Here's how to recognize burnout, and what relief can look like.",
    category: "caregiving-tips",
    tags: ["caregiver burnout", "respite care", "companion care"],
    focusKeyword: "caregiver burnout signs",
    secondaryKeywords: ["family caregiver stress", "respite care for family caregivers", "caregiver exhaustion"],
    seoTitle: "Signs of Caregiver Burnout — and How Respite Care Helps",
    seoDescription:
      "How to recognize caregiver burnout before it becomes a crisis, and how even a few hours of respite care each week can change the picture.",
    image: img("caregiver-and-senior-updating-care-journal.jpg"),
    imageAlt: "A senior woman and her caregiver laughing together while updating a care journal",
    content: `Family caregivers are remarkably good at pushing through — skipping their own doctor's appointments, losing sleep, quietly dropping hobbies and friendships, all while insisting they're "managing fine." Burnout tends to arrive gradually enough that it's hard to notice from the inside, which is exactly why it's worth naming clearly.

## Common signs of caregiver burnout

- Feeling exhausted even after a full night's sleep, on a regular basis
- Increased irritability or a shorter temper with the person you're caring for, or with others
- Withdrawing from friends, hobbies, or activities that used to matter
- A sense of dread about the day ahead, rather than just tiredness
- Getting sick more often, or noticing new physical symptoms — headaches, tension, appetite changes
- Feeling like you're the only one who can do any of it, and that asking for help would be a failure

## Why it's so easy to miss in yourself

Caregiving often starts small — picking up groceries, handling a few appointments — and grows gradually as needs increase. Because the change happens slowly, there's rarely a single moment that feels like "too much." Family caregivers frequently only recognize burnout in hindsight, once it's already affected their health or their relationship with the person they're caring for.

## What respite care actually is

Respite care is simply arranged relief — a trained caregiver stepping in for a few hours, a day, or longer, so the family caregiver can rest, attend to their own life, or just step away without worry. It isn't a replacement for family involvement; it's what makes sustained family involvement possible in the first place.

## What it can look like in practice

- A few hours a week of [companion care](/services/companion-care), so you can run errands or simply rest without a mental clock running
- Coverage during a vacation or a family event you'd otherwise have to miss
- Regular scheduled relief built into an ongoing [care plan](/#care), rather than something arranged only in a crisis

## Asking for help is not giving up

One of the biggest barriers to using respite care is guilt — a sense that a "good" family member should be able to handle it all. In practice, the caregivers who last longest, and who provide the best care over time, are the ones who build in regular relief rather than waiting until they have no choice.

If any of this sounds familiar, it's worth a conversation before things reach a breaking point, not after. A free consultation can help you figure out what kind of relief would actually help your specific situation.`,
  },
  {
    slug: "in-home-care-after-a-hospital-stay",
    title: "Coming Home After a Hospital Stay: How In-Home Care Helps",
    excerpt:
      "The weeks after a hospital discharge are when a lot of families first look into home care. Here's what that transition period actually involves.",
    category: "senior-care-services",
    tags: ["care coordination", "hospital discharge", "recovery at home"],
    focusKeyword: "in-home care after hospital discharge",
    secondaryKeywords: ["recovering at home after hospital stay", "post-hospital care for seniors", "transitional care at home"],
    seoTitle: "Coming Home After a Hospital Stay: How In-Home Care Helps",
    seoDescription:
      "What the transition home after a hospital stay actually looks like, and how in-home care and care coordination support a safer recovery.",
    image: img("care-coordination-reviewing-care-plan.jpg"),
    imageAlt: "A caregiver and a senior woman reviewing a health plan and appointment calendar together",
    content: `A hospital stay is one of the most common moments a family first looks seriously into home care — often on a tight timeline, with a discharge date arriving faster than anyone feels ready for. Understanding what that transition period actually involves makes it far less overwhelming.

## Why the first weeks home carry real risk

Hospitals discharge patients once they're medically stable, not once they're fully back to their normal routine. The days and weeks that follow are when new medications get confused, follow-up appointments get missed, and the physical toll of the hospital stay itself — deconditioning, disorientation, fatigue — becomes most apparent. This window is when additional support tends to matter most.

## What in-home support after discharge can include

- Help with the physical routine while strength and mobility recover — bathing, dressing, getting in and out of bed safely, through [personal care](/services/personal-care)
- Medication reminders, so a new or changed prescription regimen is followed correctly during the highest-risk stretch
- Meal preparation and light home management through [homemaker services](/services/homemaker-services), while energy for cooking and cleaning is still limited
- Scheduling and tracking follow-up appointments through [care coordination](/services/care-coordination), so nothing gets missed during a genuinely disorienting few weeks

## Reducing the chance of a return trip

Hospital readmissions are frequently tied to exactly the gaps in-home support is built to close: a missed medication, a fall during a still-shaky recovery, a follow-up appointment that never got scheduled. Consistent support during this window is as much about preventing a setback as it is about comfort.

## Coordinating with discharge instructions

Discharge paperwork often includes a specific care plan — wound care schedules, activity restrictions, a list of follow-up appointments. Part of what [care coordination](/services/care-coordination) offers is simply making sure that paperwork translates into an actual daily routine, rather than sitting in a folder on the kitchen counter.

## Planning ahead when you can

If a hospital stay is planned — a scheduled surgery, for example — arranging in-home support before discharge, rather than scrambling after, makes for a much smoother transition. Even for unplanned hospitalizations, a same-week conversation can typically get support in place quickly.

If your family is facing a discharge date and trying to figure out what kind of help makes sense, a free consultation is a good way to talk through the specifics before your loved one comes home.`,
  },
  {
    slug: "nutrition-tips-for-seniors-living-at-home",
    title: "Nutrition Tips for Seniors Living at Home",
    excerpt:
      "Eating well gets harder with age for reasons that have nothing to do with willpower. Here's what actually helps, and where support fits in.",
    category: "caregiving-tips",
    tags: ["homemaker services", "senior nutrition", "healthy aging"],
    focusKeyword: "nutrition tips for seniors",
    secondaryKeywords: ["senior meal planning", "eating well as you age", "nutrition for elderly living alone"],
    seoTitle: "Nutrition Tips for Seniors Living at Home",
    seoDescription:
      "Why eating well gets harder with age, practical ways to make it easier, and how meal planning support helps seniors living at home.",
    image: img("homemaker-caregiver-serving-meal-to-senior.jpg"),
    imageAlt: "A caregiver serving a home-cooked meal to a smiling senior man at his dining table",
    content: `Good nutrition becomes harder to maintain with age for reasons that have little to do with knowing what to eat. Appetite naturally decreases, cooking for one person feels like more effort than it's worth, and physical changes — taste, smell, dental issues, medication side effects — all quietly work against a good diet, even for someone who ate well their whole life.

## Why appetite and eating habits change

Reduced activity level lowers calorie needs, but the nutrients the body needs stay largely the same or even increase — a genuine mismatch that can lead to "eating less" quietly becoming "eating less of what's actually needed." Some medications suppress appetite directly or change how food tastes, and depression or isolation can dampen interest in meals in a way that's easy to mistake for simply "not being that hungry anymore."

## Practical ways to make eating easier

- **Smaller, more frequent meals** often work better than three large ones when appetite is limited
- **Protein at every meal** helps maintain muscle mass, which matters directly for strength and fall prevention
- **Keep favorite, familiar foods on hand** — novelty isn't the goal here; consistency and appeal are
- **Make mealtimes social where possible** — food eaten in company is reliably eaten in larger amounts than food eaten alone
- **Simplify, don't skip** — a good sandwich or a simple soup is better than an elaborate meal that never gets made

## Watching for warning signs

Unintended weight loss, a pantry with little fresh food, or meals that have become smaller and less varied over a few months are all worth paying attention to. These changes tend to happen gradually, which is exactly why they're easy to miss during a normal phone call or short visit.

## Where meal support fits in

[Homemaker services](/services/homemaker-services) build nutrition support directly into a care plan — meal planning around what your loved one actually likes and can manage, grocery shopping so the right ingredients are on hand, and the company of a caregiver at mealtime, which on its own often improves how much gets eaten.

## It's rarely about willpower

If a parent's eating habits have slipped, it's very unlikely to be about motivation. It's far more often about energy, ease, and company — all things that the right support can address directly, without a single lecture about diet.

A free consultation is a good way to talk through what's actually changed at mealtimes, and whether some help with planning and preparation would make a real difference.`,
  },
  {
    slug: "how-to-choose-a-home-care-agency-in-seattle",
    title: "How to Choose a Home Care Agency in Seattle: A Family's Checklist",
    excerpt:
      "Seattle has no shortage of home care options. Here's a practical checklist for narrowing them down to the one that actually fits your family.",
    category: "family-resources",
    tags: ["in-home care", "seattle senior care", "choosing a caregiver"],
    focusKeyword: "home care agency seattle",
    secondaryKeywords: ["choosing a home care agency", "best home care seattle", "seattle in-home senior care"],
    seoTitle: "How to Choose a Home Care Agency in Seattle",
    seoDescription:
      "A practical checklist for Seattle families comparing home care agencies — what to ask, what to compare, and how to narrow down the options.",
    image: img("meeting-your-caregiver-handshake.jpg"),
    imageAlt: "A caregiver and a senior man shaking hands as they meet for the first time",
    content: `Searching "home care Seattle" turns up a long list of agencies that all describe themselves in similar terms — compassionate, experienced, personalized. The words rarely help you tell them apart. What actually matters is underneath the marketing language, and it's worth checking directly.

## Confirm the service area, specifically

"Serving Seattle" can mean anything from the city core to a sprawling multi-county territory with inconsistent coverage. Ask directly whether your specific neighborhood is reliably staffed, not just technically within the service area.

## Ask how caregivers are actually matched

Some agencies assign whoever is available for the shift. Others build in real introductions — meeting two or three caregiver options before choosing. If personality fit matters to your family (it usually does), ask specifically how matching works before you commit.

## Ask about trial periods

A short monitored trial, with regular check-ins, is one of the clearest signs an agency expects its matches to actually work — and gives your family a real chance to adjust course early if something isn't right, rather than discovering a mismatch months in.

## Get specific about what's included at each level

"Personal care," "companion care," and "care coordination" mean different things at different agencies. Ask for the actual list of tasks covered at the level you're considering, rather than a general description.

## Ask how the family stays informed

If you're not the one present day to day, ask specifically how updates are shared — a daily digital update and photo care journal is a very different experience than a phone call only when something goes wrong.

## Compare how — not just whether — pricing is explained

Reasonable agencies won't quote a number without understanding your situation, but they should walk you through exactly what factors into it: level of care, schedule, and specific services needed. If an agency won't explain its pricing logic at all, that's worth noting.

## Trust the first conversation

How an agency handles your first call is often a fair preview of how they'll handle the relationship going forward — whether they listen more than they pitch, whether they ask about your loved one specifically rather than reciting a script, and whether you come away with clear next steps.

If you're comparing options right now, a free consultation with our team is a low-pressure way to see how we handle exactly these questions — no obligation, and no pressure to decide on the spot.`,
  },
  {
    slug: "stages-of-dementia-what-changes-at-home",
    title: "Understanding the Stages of Dementia — and What Changes at Home",
    excerpt:
      "Dementia care needs shift as the condition progresses. Here's a general look at what tends to change, and how in-home support adapts alongside it.",
    category: "dementia-care",
    tags: ["dementia care", "memory care", "family caregiving"],
    focusKeyword: "stages of dementia care at home",
    secondaryKeywords: ["early stage dementia care", "middle stage dementia support", "late stage dementia home care"],
    seoTitle: "Understanding the Stages of Dementia at Home",
    seoDescription:
      "A general look at how dementia care needs change across early, middle, and later stages, and how in-home support adapts at each one.",
    image: img("companion-care-word-game-with-seniors.jpg"),
    imageAlt: "A caregiver playing a word board game with a senior couple in their living room",
    content: `Dementia doesn't progress on a fixed schedule, and no two people move through it exactly the same way. Still, care needs generally shift in recognizable patterns, and understanding roughly what to expect helps families plan rather than just react. This is general information, not a diagnosis or medical guidance — always work with your loved one's doctor on the clinical picture.

## Early stage: independence with light support

In the earliest stage, a person is often still managing most of daily life, with occasional lapses — misplaced items, repeated questions, minor difficulty with complex tasks like managing finances or medications. Support at this stage tends to be light-touch: medication reminders, help with appointments, and companionship that keeps a normal routine and social connection going, through [companion care](/services/companion-care) and [homemaker services](/services/homemaker-services).

## Middle stage: routine and safety become central

As changes progress, confusion becomes more frequent, personality and mood shifts are more noticeable, and personal care tasks — bathing, dressing — often need more direct help. Wandering and safety become real considerations. This is typically where [dementia and memory care](/services/dementia-care) support becomes more structured: a consistent, familiar caregiver, a steady daily routine, and an engagement program suited to what still brings enjoyment and a sense of accomplishment.

## Later stage: comprehensive, hands-on care

In later stages, a person typically needs help with most or all daily activities, and communication becomes more limited. Care at this stage is largely about comfort, dignity, and consistency — familiar touch, familiar voices, and a caregiver who has built real continuity with the person, which is exactly why continuity of care matters so much earlier in the process.

## Why continuity matters at every stage

Across all stages, the same principle holds: consistency reduces confusion and anxiety. The same caregiver, the same routine, the same approach to a difficult moment — all of it is more effective, and more humane, than rotating through unfamiliar faces. That's why continuity with trained, familiar caregivers is built into how dementia support is structured from the start, not added later.

## Plans that adapt as things change

Because needs shift, dementia care benefits from regular reassessment rather than a plan set once and left alone. Quarterly assessment updates and ongoing care conferences exist specifically so the plan can move with the condition, instead of a family having to notice the gap and ask for a change themselves.

## Supporting the family through every stage

Each stage brings its own weight for the family, not just the person living with dementia. If you're trying to understand where things stand right now and what kind of support actually fits, a free consultation is a good place to start that conversation.`,
  },
  {
    slug: "safe-exercise-ideas-for-seniors-with-limited-mobility",
    title: "Safe Exercise Ideas for Seniors with Limited Mobility",
    excerpt:
      "Staying active doesn't require a gym or full mobility. Here are gentle, adaptable ways seniors can keep moving safely at home.",
    category: "caregiving-tips",
    tags: ["companion care", "senior fitness", "healthy aging"],
    focusKeyword: "exercise for seniors with limited mobility",
    secondaryKeywords: ["gentle exercise for elderly", "chair exercises for seniors", "staying active with limited mobility"],
    seoTitle: "Safe Exercise Ideas for Seniors with Limited Mobility",
    seoDescription:
      "Gentle, adaptable ways seniors with limited mobility can stay active at home — always check with a doctor before starting anything new.",
    image: img("caregiver-check-in-with-senior-on-tablet.jpg"),
    imageAlt: "A caregiver noting a senior woman's check-in details on a tablet in her living room",
    content: `Limited mobility doesn't mean no movement is possible — it usually means finding the right kind. Staying active, even gently, helps maintain strength, balance, and mood, all of which directly affect independence and fall risk. As always, check with a doctor before starting anything new, especially with existing health conditions.

## Chair-based exercises

For anyone who tires quickly or has balance concerns, seated exercises offer real benefit with much lower risk:

- Seated marching — lifting knees one at a time while seated
- Arm raises and gentle stretches, held for a few breaths
- Ankle circles and toe taps, which support circulation and lower-body strength
- Seated torso twists, gentle and within a comfortable range

## Standing exercises with support

For those who can stand with some support — a chair back, a counter, a wall:

- Standing marches, holding a stable surface
- Heel raises, rising onto the toes and back down slowly
- Gentle standing side leg lifts, one at a time

## Walking, even in short stretches

Short, regular walks — around the living room, down a hallway, to the mailbox and back — do real work for circulation, mood, and stamina, even at a slow pace. Consistency matters more than distance; several short walks through the day are often more sustainable than one long one.

## Simple stretching for comfort and range of motion

Gentle stretching of the shoulders, neck, and legs — held briefly, never forced into pain — helps maintain the range of motion that makes everyday tasks like dressing and reaching easier.

## Making it something to look forward to

Exercise is far easier to sustain with company. A [companion care](/services/companion-care) caregiver can turn a stretching routine or a short walk into a social moment rather than a chore — someone to talk with, to count reps with, and to make sure it happens consistently rather than getting skipped on a hard day.

## When to stop and check in

Any new pain, dizziness, or shortness of breath during activity is a signal to stop and check with a doctor before continuing. Gentle and consistent is the goal here, not pushing through discomfort.

If mobility has become more limited and you're not sure what's safe to try, that's exactly the kind of question worth raising during a free consultation — we can talk through what a caregiver's support might look like day to day.`,
  },
  {
    slug: "what-affects-the-cost-of-in-home-senior-care",
    title: "What Affects the Cost of In-Home Senior Care?",
    excerpt:
      "There's no single price tag for home care, because there's no single care plan. Here's what actually drives the cost, without a made-up number attached.",
    category: "family-resources",
    tags: ["in-home care", "cost of care", "seattle senior care"],
    focusKeyword: "cost of in-home senior care",
    secondaryKeywords: ["how much does home care cost", "senior care pricing factors", "in-home care rates"],
    seoTitle: "What Affects the Cost of In-Home Senior Care?",
    seoDescription:
      "The real factors that drive the cost of in-home senior care — hours, level of support, and schedule — explained without a generic price tag.",
    image: img("family-care-consultation.jpg"),
    imageAlt: "A caregiver reviewing care paperwork with three generations of a family around a table",
    content: `"How much does home care cost?" is usually the first question families ask, and the honest answer is always some version of "it depends" — not as a dodge, but because there genuinely isn't a single price for a service that's built around one specific person's needs. What follows are the actual factors that drive it, so "it depends" means something concrete.

## Hours and schedule

The most direct driver of cost is simply how much time a caregiver spends with your loved one each week — a few hours several times a week looks very different, cost-wise, from daily support or live-in-style coverage. Families often start smaller than they expect to need, and adjust from there.

## Level of care

[Standard Care](/#care) covers daily essentials — hygiene, meals, medication reminders. [Premium Care](/#care) adds coordination, assessments, transportation, and memory support. [All-Inclusive Care](/#care) adds customized activities and every add-on. Each level represents meaningfully more service, which is reflected in the cost.

## Specific services required

Personal care, homemaker support, companion care, and care coordination can be combined in different proportions depending on what's actually needed. A plan built mostly around companionship costs differently than one built around more hands-on personal care.

## Continuity and caregiver matching

Requesting the same, familiar caregiver consistently — which matters a great deal for dementia care in particular — is a service in itself, distinct from accepting whoever is available for a given shift.

## Add-ons for a smoother start

Options like a comprehensive family consultation, caregiver selection support, and a monitored trial period add value during the transition into care, and are priced as the additional service they represent.

## Why we don't publish a flat rate

A published "starting at" number is often technically true but practically misleading — it rarely reflects what a specific family will actually pay once their real schedule and needs are factored in. We'd rather walk through your situation directly and give you an accurate number than a generic one that changes as soon as we learn more about what you need.

## Getting a real number

The fastest way to get pricing that actually applies to your situation is a [free consultation](/#consultation) — we'll ask about your loved one's routine, the level of support that fits, and the schedule you have in mind, and come back with a clear, specific quote rather than a range.

Call {PHONE} whenever you're ready to talk through the specifics — there's no obligation attached to the conversation.`,
  },
];

async function run() {
  await connectDb();

  const admin = await ensureAdmin();
  const categories = await ensureCategories();
  const authorId = await ensureAuthor();

  let day = 0;
  for (const p of POSTS) {
    // Newest of this batch lands today; oldest lands ~27 days back, mixing
    // in with the first batch's 4-40-day-old dates rather than clustering.
    const publishedAt = new Date(Date.now() - (POSTS.length - 1 - day) * 3 * 24 * 60 * 60 * 1000).toISOString();
    day += 1;

    const input = {
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      content: p.content.replaceAll("{PHONE}", "(206) 848-5121"),
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
