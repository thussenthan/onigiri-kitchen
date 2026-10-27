import json
import types


def cmd(main, name, arg=""):
    return main.handle_kitchen_cmd(name, arg, None)


def test_the_hooks_are_registered(main):
    hooks = main._env.hooks
    assert main.on_sync_finished in hooks.sync_did_finish
    assert main.on_answer in hooks.reviewer_did_answer_card
    assert len(hooks.editor_did_load_note) == 1 and len(hooks.browser_did_change_row) == 1


def test_json_in_a_script_cannot_close_it_or_open_a_comment(main):
    out = main._script_json({"deck": "</script><!--<script>alert(1)"})
    assert "<" not in out and json.loads(out)["deck"] == "</script><!--<script>alert(1)"


def test_settings_are_kept_inside_sensible_bounds(main):
    saved = {}
    main.mw.addonManager.writeConfig = lambda n, c: saved.update(c)
    main.write_conf({"focus_minutes": -5, "volume": 7, "reviews_per_guest": 0, "idle_pause_minutes": 9999,
                     "theme_mode": "neon", "clock_style": "flip", "sound": 0, "bogus": 1})
    assert saved["focus_minutes"] == 1 and saved["volume"] == 1.0 and saved["reviews_per_guest"] == 1
    assert saved["idle_pause_minutes"] == 60 and saved["theme_mode"] == "anki" and saved["clock_style"] == "flip"
    assert saved["sound"] is False and "bogus" not in saved


def test_the_kitchen_works_out_the_tip_and_pays_a_seated_guest_once(main):
    main.state.add_guest({"deck": "Spanish", "kind": "regular"})
    guest = cmd(main, "claim")
    assert guest["deck"] == "Spanish" and len(main.state.data["serving"]) == 1
    snap = cmd(main, "pay", json.dumps({"base": 3, "dishBonus": 2, "deck": "Spanish", "kind": "regular"}))
    assert snap["tip"] == 5 and snap["mon"] == 5 and main.state.data["serving"] == []


def test_a_page_cannot_make_up_a_kind_or_an_amount(main):
    snap = cmd(main, "pay", json.dumps({"base": "lots", "kind": "emperor", "deck": None}))
    assert snap["tip"] == 0
    snap = cmd(main, "pay", "{not json")
    assert snap["tip"] == 0


def test_the_old_page_protocol_still_works(main):
    assert cmd(main, "pay", json.dumps({"amount": 4, "kind": "regular"}))["mon"] == 4
    assert cmd(main, "pay", json.dumps({"amount": 4000, "kind": "regular"}))["tip"] == 100


def test_opening_the_kitchen_again_seats_nobody_who_never_paid(main):
    main.state.add_guest({"deck": "A", "kind": "regular"})
    cmd(main, "claim")
    payload = main.init_payload("test")
    assert main.state.data["serving"] == [] and payload["state"]["guestsWaiting"] == 1


def test_answering_a_card_counts_it_by_deck_id(main):
    mw = main.mw
    mw.col.db.all = lambda *a: [(42, 10)]
    mw.col.decks.name = lambda did: "Spanish" if did == 42 else "Deck"
    note = types.SimpleNamespace(has_tag=lambda t: False)
    card = types.SimpleNamespace(did=42, odid=0, note=lambda: note)
    main.on_answer(None, card, 3)
    assert [g["deck"] for g in main.state.data["guests"]] == ["Spanish"]
    mw.decks_renamed = True
    mw.col.decks.name = lambda did: "Spanish 2" if did == 42 else "Deck"
    main.on_answer(None, card, 3)
    assert len(main.state.data["guests"]) == 1  # (a rename is not a new round of guests)


def test_reviews_done_elsewhere_and_synced_later_bring_takeout(main):
    mw = main.mw
    today = main.datetime.date.fromisoformat(main.anki_today())
    day = (today - main.datetime.timedelta(days=1)).isoformat()
    main.state.data["credited"][day] = 20
    mw.col.db.all = lambda *a: [(99998, 50)]  # (index 99998 is yesterday)
    shown = []
    main.tooltip = lambda text, **k: shown.append(text)
    main.on_sync_finished()
    assert main.state.data["takeout"]["count"] == 3 and shown and "3 takeout guests" in shown[0]


def test_a_page_that_fails_to_build_does_not_leave_a_broken_window(main):
    main.KitchenDialog = lambda reason: (_ for _ in ()).throw(RuntimeError("boom"))
    shown = []
    main.tooltip = lambda text, **k: shown.append(text)
    main.open_kitchen()
    assert main._dialog is None and shown and "couldn't open" in shown[0]


def test_web_files_are_read_once(main):
    first = main._read_web("chip.js")
    assert first and main._read_web("chip.js") is first and main._read_web("missing.js") == ""
