// scripts/seed.js
// Wipes and reloads sample data: a realistic mini computer-science
// curriculum modelled as a graph (Course, Skill, Category nodes;
// REQUIRES / TEACHES / ENABLES / BELONGS_TO relationships).
//
// Run with:  npm run seed

require('dotenv').config();
const neo4j = require('neo4j-driver');

const URI = process.env.COGNODB_URI;
const USER = process.env.COGNODB_USER;
const PASSWORD = process.env.COGNODB_PASSWORD;

if (!URI || !USER || !PASSWORD) {
  console.error('Missing COGNODB_URI / COGNODB_USER / COGNODB_PASSWORD in .env');
  process.exit(1);
}

const courses = [
  { id: 'cs101', title: 'Intro to Programming', level: 1, category: 'Computer Science',
    description: 'Variables, control flow, functions - your first steps writing code.',
    skills: ['Programming Basics'] },
  { id: 'cs102', title: 'Data Structures', level: 2, category: 'Computer Science',
    description: 'Arrays, linked lists, trees, hash maps and when to use each.',
    skills: ['Data Structures'], requires: ['cs101'] },
  { id: 'cs201', title: 'Algorithms', level: 3, category: 'Computer Science',
    description: 'Sorting, searching, greedy and dynamic programming techniques.',
    skills: ['Algorithmic Thinking'], requires: ['cs102'] },
  { id: 'cs210', title: 'Discrete Mathematics', level: 2, category: 'Mathematics',
    description: 'Logic, set theory, combinatorics and graph theory foundations.',
    skills: ['Mathematical Reasoning'], requires: ['cs101'] },
  { id: 'cs301', title: 'Databases', level: 3, category: 'Computer Science',
    description: 'Relational modelling, SQL, transactions and indexing.',
    skills: ['Database Design'], requires: ['cs102'] },
  { id: 'cs302', title: 'Graph Databases', level: 4, category: 'Computer Science',
    description: 'Property graphs, Cypher, traversals and when graphs beat tables.',
    skills: ['Graph Modeling'], requires: ['cs301', 'cs210'] },
  { id: 'cs320', title: 'Web Development', level: 3, category: 'Computer Science',
    description: 'HTTP, REST APIs, front-end and back-end fundamentals.',
    skills: ['Web Development'], requires: ['cs102'] },
  { id: 'cs330', title: 'Full-Stack Engineering', level: 4, category: 'Computer Science',
    description: 'Building and deploying complete applications end to end.',
    skills: ['Full-Stack Engineering'], requires: ['cs320', 'cs301'] },
  { id: 'cs401', title: 'Distributed Systems', level: 5, category: 'Computer Science',
    description: 'Consensus, replication, partitioning and fault tolerance.',
    skills: ['Systems Design'], requires: ['cs201', 'cs301'] },
  { id: 'cs410', title: 'Graph Application Architecture', level: 5, category: 'Computer Science',
    description: 'Designing production graph-backed applications and APIs.',
    skills: ['Graph Application Design'], requires: ['cs302', 'cs330'] },
  { id: 'ml101', title: 'Intro to Machine Learning', level: 3, category: 'Data Science',
    description: 'Supervised learning, model evaluation, and basic pipelines.',
    skills: ['Machine Learning'], requires: ['cs201', 'cs210'] },
  { id: 'ml201', title: 'Graph Neural Networks', level: 5, category: 'Data Science',
    description: 'Learning representations over graph-structured data.',
    skills: ['Graph ML'], requires: ['ml101', 'cs302'] },
  { id: 'ux101', title: 'UX Design Fundamentals', level: 1, category: 'Design',
    description: 'User research, wireframing and usability heuristics.',
    skills: ['UX Design'] },
  { id: 'ux201', title: 'Interaction Design for Data Apps', level: 3, category: 'Design',
    description: 'Designing dashboards and exploratory tools for complex data.',
    skills: ['Data UX'], requires: ['ux101', 'cs320'] },
];

// Skill -> Skill "opens up" edges (separate from course prerequisites,
// used by the /api/skills/:name/courses endpoint)
const skillEnables = [
  ['Programming Basics', 'Data Structures'],
  ['Data Structures', 'Algorithmic Thinking'],
  ['Algorithmic Thinking', 'Machine Learning'],
  ['Database Design', 'Graph Modeling'],
  ['Graph Modeling', 'Graph ML'],
  ['Graph Modeling', 'Graph Application Design'],
  ['Web Development', 'Full-Stack Engineering'],
  ['Full-Stack Engineering', 'Graph Application Design'],
  ['UX Design', 'Data UX'],
];

async function main() {
  const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
  const session = driver.session();
  try {
    console.log('Connecting to CognoDB...');
    await driver.verifyConnectivity();

    console.log('Clearing existing data...');
    await session.run('MATCH (n) DETACH DELETE n');

    console.log('Creating constraints...');
    await session.run('CREATE CONSTRAINT course_id IF NOT EXISTS FOR (c:Course) REQUIRE c.id IS UNIQUE');

    console.log('Loading courses, categories and skills...');
    for (const c of courses) {
      await session.run(
        `MERGE (course:Course {id: $id})
         SET course.title = $title, course.level = $level, course.description = $description
         MERGE (cat:Category {name: $category})
         MERGE (course)-[:BELONGS_TO]->(cat)
         WITH course
         UNWIND $skills AS skillName
         MERGE (s:Skill {name: skillName})
         MERGE (course)-[:TEACHES]->(s)`,
        { id: c.id, title: c.title, level: c.level, description: c.description,
          category: c.category, skills: c.skills }
      );
    }

    console.log('Wiring prerequisite (REQUIRES) edges...');
    for (const c of courses) {
      if (!c.requires) continue;
      for (const reqId of c.requires) {
        await session.run(
          `MATCH (c:Course {id: $id}), (p:Course {id: $reqId})
           MERGE (c)-[:REQUIRES]->(p)`,
          { id: c.id, reqId }
        );
      }
    }

    console.log('Wiring skill (ENABLES) edges...');
    for (const [from, to] of skillEnables) {
      await session.run(
        `MATCH (a:Skill {name: $from}), (b:Skill {name: $to})
         MERGE (a)-[:ENABLES]->(b)`,
        { from, to }
      );
    }

    const counts = await session.run(
      `MATCH (c:Course) WITH count(c) AS courses
       MATCH (s:Skill) WITH courses, count(s) AS skills
       MATCH ()-[r:REQUIRES]->() WITH courses, skills, count(r) AS reqs
       RETURN courses, skills, reqs`
    );
    const rec = counts.records[0];
    console.log(`Done. Loaded ${rec.get('courses')} courses, ${rec.get('skills')} skills, ${rec.get('reqs')} prerequisite edges.`);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await session.close();
    await driver.close();
  }
}

main();
