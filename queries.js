// queries.js
// Every Cypher statement the app runs, in one place, fully parameterised.
// See README.md "Main queries explained" for a walkthrough of each one.

module.exports = {
  // Simple lookups -----------------------------------------------------

  LIST_COURSES: `
    MATCH (c:Course)
    OPTIONAL MATCH (c)-[:BELONGS_TO]->(cat:Category)
    RETURN c { .id, .title, .level, .description } AS course, cat.name AS category
    ORDER BY c.level, c.title
  `,

  GET_COURSE: `
    MATCH (c:Course {id: $id})
    OPTIONAL MATCH (c)-[:BELONGS_TO]->(cat:Category)
    OPTIONAL MATCH (c)-[:TEACHES]->(s:Skill)
    RETURN c { .id, .title, .level, .description } AS course,
           cat.name AS category,
           collect(DISTINCT s.name) AS skills
  `,

  // Direct (1-hop) neighbours -------------------------------------------

  DIRECT_PREREQS: `
    MATCH (c:Course {id: $id})-[:REQUIRES]->(p:Course)
    RETURN p { .id, .title, .level } AS course
  `,

  DIRECT_UNLOCKS: `
    MATCH (c:Course {id: $id})<-[:REQUIRES]-(n:Course)
    RETURN n { .id, .title, .level } AS course
  `,

  // Multi-hop traversal (2+ hops): the full transitive prerequisite chain
  // for a course - "everything I must complete, directly or indirectly,
  // before I can take this course". This is the kind of recursive,
  // unbounded-depth query that is native to Cypher (variable-length paths)
  // but requires a recursive CTE (and careful cycle handling) in SQL.
  FULL_PREREQUISITE_CHAIN: `
    MATCH path = (c:Course {id: $id})-[:REQUIRES*1..6]->(p:Course)
    WITH DISTINCT p, min(length(path)) AS depth
    RETURN p { .id, .title, .level } AS course, depth
    ORDER BY depth, p.title
  `,

  // Multi-hop: everything that becomes reachable once this course is done
  FULL_UNLOCK_CHAIN: `
    MATCH path = (c:Course {id: $id})<-[:REQUIRES*1..6]-(n:Course)
    WITH DISTINCT n, min(length(path)) AS depth
    RETURN n { .id, .title, .level } AS course, depth
    ORDER BY depth, n.title
  `,

  // Shortest learning path between any two courses, following prerequisite
  // edges in either direction - lets a learner ask "what's the fastest
  // route from what I know to what I want to learn?". A relational
  // database has no native shortest-path operator; this needs an
  // application-side BFS/CTE loop with no guaranteed shortest-path result.
  SHORTEST_PATH: `
    MATCH (a:Course {id: $fromId}), (b:Course {id: $toId})
    MATCH path = shortestPath((a)-[:REQUIRES*..8]-(b))
    RETURN [n IN nodes(path) | n { .id, .title, .level }] AS nodes,
           length(path) AS hops
  `,

  // Skill-graph query: courses that teach a given skill, plus - via a
  // second hop through Skill->ENABLES->Skill - the further skills a
  // learner is set up to acquire next. Awkward in SQL because it chains
  // two different many-to-many relationship types across a variable path.
  SKILL_EXPANSION: `
    MATCH (s:Skill {name: $skillName})<-[:TEACHES]-(c:Course)
    OPTIONAL MATCH (s)-[:ENABLES]->(next:Skill)
    RETURN c { .id, .title, .level } AS course,
           collect(DISTINCT next.name) AS opensUpSkills
    ORDER BY c.level, c.title
  `,

  LIST_SKILLS: `
    MATCH (s:Skill)
    RETURN s.name AS name
    ORDER BY s.name
  `,

  SEARCH_COURSES: `
    MATCH (c:Course)
    WHERE toLower(c.title) CONTAINS toLower($term)
       OR toLower(c.description) CONTAINS toLower($term)
    RETURN c { .id, .title, .level, .description } AS course
    ORDER BY c.title
    LIMIT 20
  `,
};
