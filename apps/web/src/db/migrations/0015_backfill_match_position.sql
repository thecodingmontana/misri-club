-- Rounds created before matches.position existed all sit at 0. Number their
-- matches 0..n-1 (stable by id) so the bracket shows every tie and the next
-- round pairs the same neighbours the page draws. Rounds already numbered are
-- left alone.
WITH legacy AS (
  SELECT competition_id, round
  FROM matches
  GROUP BY competition_id, round
  HAVING count(*) > 1 AND count(DISTINCT position) = 1
),
numbered AS (
  SELECT m.id,
         row_number() OVER (PARTITION BY m.competition_id, m.round ORDER BY m.id) - 1 AS pos
  FROM matches m
  JOIN legacy l ON l.competition_id = m.competition_id AND l.round = m.round
)
UPDATE matches SET position = numbered.pos
FROM numbered
WHERE matches.id = numbered.id;
