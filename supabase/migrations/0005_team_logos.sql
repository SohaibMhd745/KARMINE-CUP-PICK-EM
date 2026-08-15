-- =====================================================================
--  KARMINE CUP PICK'EM — mise à jour des logos d'équipes
-- =====================================================================
--  Assigne les URLs relatives des logos d'équipes stockés dans
--  /public/assets/teams/ (ou /assets/teams/).
-- =====================================================================

update teams set logo_url = '/assets/teams/kancel_corp.jpg'          where name = 'KANCEL CORP' or short_code = 'KAN';
update teams set logo_url = '/assets/teams/gooning_corp.jpg'         where name = 'GOONING CORP' or short_code = 'GOO';
update teams set logo_url = '/assets/teams/zeub.jpg'                 where name = 'ZEUB' or short_code = 'ZEU';
update teams set logo_url = '/assets/teams/full_trust.jpg'           where name = 'FULL TRUST' or short_code = 'FUL';
update teams set logo_url = '/assets/teams/kdavre_corp.jpg'          where name = 'KDAVRE CORP' or short_code = 'KDA';
update teams set logo_url = '/assets/teams/wall_breakers.jpg'        where name = 'WALL BREAKERS' or short_code = 'WAL';
update teams set logo_url = '/assets/teams/destructive_capacity.jpg' where name = 'DESTRUCTIVE CAPACITY' or short_code = 'DES';
update teams set logo_url = '/assets/teams/feet_and_fun.jpg'         where name = 'FEET AND FUN' or short_code = 'FEE';
